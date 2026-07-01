import { Controller, Get, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { TransactionHistoryResponse } from './interfaces/transaction.interface';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * GET /payments/history
   * Returns the Stellar transaction history for a user account.
   *
   * MVP: returns stub data for the canonical sample account GACCOUNT-STUB-1.
   * Real implementation should query the Stellar Horizon server via
   * `@stellar/stellar-sdk` and paginate using Horizon's `cursor` token.
   */
  @Get('history')
  getTransactionHistory(
    @Query() query: TransactionHistoryQueryDto,
  ): TransactionHistoryResponse {
    return this.paymentsService.getTransactionHistory(query);
  }
}
