import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { TransactionHistoryResponse } from './interfaces/transaction.interface';
import { AntiCheatService } from '../security/anti-cheat.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly antiCheatService: AntiCheatService,
    private readonly configService?: ConfigService,
  ) {}

  @Get('history')
  getTransactionHistory(
    @Query() query: TransactionHistoryQueryDto,
  ): TransactionHistoryResponse {
    return this.paymentsService.getTransactionHistory(query);
  }

  /**
   * POST /payments/webhook — receives provider webhook callbacks.
   * Verifies HMAC signature and rejects replayed payloads — Issue #411.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  receiveWebhook(
    @Body() body: string,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): { received: boolean } {
    const webhookSecret = this.configService?.get<string>('WEBHOOK_SIGNATURE_SECRET');
    if (webhookSecret) {
      if (!signature) {
        throw new UnauthorizedException('Missing webhook signature');
      }
      const crypto = require('crypto');
      const expected = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !require('crypto').timingSafeEqual(sigBuf, expBuf)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    if (idempotencyKey) {
      const replayed = this.antiCheatService.isWebhookReplayed(idempotencyKey);
      if (replayed) {
        throw new UnauthorizedException('Duplicate/replayed webhook payload');
      }
    }

    return { received: true };
  }
}
