import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PaymentsService, PaymentWebhookEvent } from './payments.service';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { TransactionHistoryResponse } from './interfaces/transaction.interface';
import { AntiCheatService } from '../security/anti-cheat.service';
import { SecurityService } from '../security/security.service';
import { MetricsService } from '../monitoring/metrics.service';

const WEBHOOK_METRIC_SOURCE = 'payments.webhook';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly antiCheatService: AntiCheatService,
    private readonly securityService: SecurityService,
    private readonly metricsService: MetricsService,
    private readonly configService?: ConfigService,
  ) {}

  @Get('history')
  getTransactionHistory(@Query() query: TransactionHistoryQueryDto): TransactionHistoryResponse {
    return this.paymentsService.getTransactionHistory(query);
  }

  /**
   * POST /payments/webhook — receives provider webhook callbacks.
   *
   * #662: The HMAC signature is verified against the *raw* request bytes
   * (`req.rawBody`, enabled via `rawBody: true` in main.ts) using a
   * timing-safe comparison *before* the payload is parsed or normalized.
   * This guarantees the signature covers exactly what the provider sent, and
   * that an invalid signature can never reach
   * `PaymentsService.processPaymentWebhookEvent` (so it can never mutate
   * payment state). Transport-level replayed payloads are then rejected via
   * the idempotency key (Issue #411), and the parsed event is handed to
   * PaymentsService.processPaymentWebhookEvent, which validates the
   * requested status transition against the payment's *current* stored
   * status — this is what prevents duplicate/out-of-order callbacks from
   * corrupting payment state even when they aren't exact byte-for-byte
   * replays (Issue #412 follow-up).
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: string,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<{ received: boolean; outcome?: string; reason?: string }> {
    const webhookSecret = this.configService?.get<string>('WEBHOOK_SIGNATURE_SECRET');
    if (webhookSecret) {
      if (!signature) {
        throw new UnauthorizedException('Missing webhook signature');
      }
      // Verify against the unparsed request bytes. `rawBody` is a Buffer when
      // Nest's raw-body capture is enabled; fall back to re-serializing the
      // parsed body so direct unit-test invocations still verify correctly.
      const rawBody =
        req.rawBody ??
        Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
      const valid = this.securityService.verifyWebhookSignatureRaw(
        rawBody,
        signature,
        webhookSecret,
      );
      if (!valid) {
        this.metricsService.recordErrorEvent(WEBHOOK_METRIC_SOURCE, 'invalid_signature');
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    if (idempotencyKey) {
      // Issue #663: the replay claim is durable and fingerprint-bound to
      // this payload, so a replayed callback is recognised even after a
      // process restart and in-progress vs completed work is distinguished.
      const rawPayload = typeof body === 'string' ? body : JSON.stringify(body ?? {});
      const replayed = await this.antiCheatService.isWebhookReplayed(
        idempotencyKey,
        rawPayload,
      );
      if (replayed) {
        this.metricsService.recordErrorEvent(WEBHOOK_METRIC_SOURCE, 'transport_replay');
        throw new UnauthorizedException('Duplicate/replayed webhook payload');
      }
    }

    let event: PaymentWebhookEvent;
    try {
      const raw =
        req.rawBody?.toString('utf8') ??
        (typeof body === 'string' ? body : JSON.stringify(body));
      const parsed = JSON.parse(raw);
      event = this.toPaymentWebhookEvent(parsed);
    } catch (err) {
      this.metricsService.recordErrorEvent(WEBHOOK_METRIC_SOURCE, 'malformed_payload');
      throw new BadRequestException('Malformed webhook payload');
    }

    const result = await this.paymentsService.processPaymentWebhookEvent(event);

    switch (result.outcome) {
      case 'applied':
        this.metricsService.recordDomainEvent('payment_status_transitioned', WEBHOOK_METRIC_SOURCE);
        return { received: true, outcome: result.outcome };
      case 'duplicate':
        this.metricsService.recordErrorEvent(WEBHOOK_METRIC_SOURCE, 'duplicate_event');
        return { received: true, outcome: result.outcome, reason: result.reason };
      case 'noop':
        this.metricsService.recordDomainEvent('payment_status_noop', WEBHOOK_METRIC_SOURCE);
        return { received: true, outcome: result.outcome, reason: result.reason };
      case 'rejected':
        this.metricsService.recordErrorEvent(WEBHOOK_METRIC_SOURCE, 'illegal_transition');
        // Acknowledge receipt (so the provider doesn't retry forever) while
        // surfacing that the state mutation itself was refused.
        return { received: true, outcome: result.outcome, reason: result.reason };
      default:
        return { received: true };
    }
  }

  private toPaymentWebhookEvent(parsed: any): PaymentWebhookEvent {
    const required = [
      'eventId',
      'paymentId',
      'orderId',
      'userId',
      'status',
      'amount',
      'assetCode',
      'provider',
    ];
    for (const field of required) {
      if (parsed?.[field] === undefined || parsed?.[field] === null) {
        throw new Error(`Missing required webhook field: ${field}`);
      }
    }
    const allowedStatuses = ['pending', 'processing', 'succeeded', 'failed', 'refunded'];
    if (!allowedStatuses.includes(parsed.status)) {
      throw new Error(`Unrecognized payment status: ${parsed.status}`);
    }
    return {
      eventId: String(parsed.eventId),
      paymentId: String(parsed.paymentId),
      orderId: String(parsed.orderId),
      userId: String(parsed.userId),
      status: parsed.status,
      amount: Number(parsed.amount),
      assetCode: String(parsed.assetCode),
      provider: String(parsed.provider),
      couponCode: parsed.couponCode ? String(parsed.couponCode) : undefined,
    };
  }
}
