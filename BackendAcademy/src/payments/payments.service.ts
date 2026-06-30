import { Injectable } from '@nestjs/common';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import {
  StellarTransaction,
  TransactionHistoryResponse,
} from './interfaces/transaction.interface';

@Injectable()
export class PaymentsService {
  /**
   * In-memory stub ledger. The list is illustrative only - real
   * implementation must replace this with a Horizon server query:
   *
   *   const server = new StellarSdk.Horizon.Server(HORIZON_URL);
   *   server
   *     .payments()
   *     .forAccount(account)
   *     .order('desc')
   *     .limit(limit)
   *     .call()
   *
   * TODO: replace with Horizon-backed repository once @stellar/stellar-sdk is
   * added to BackendAcademy dependencies.
   */
  private readonly stubLedger: StellarTransaction[] = [
    {
      id: 'tx-stub-0001',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60001',
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      type: 'payment',
      amount: '100.0000000',
      assetCode: 'XLM',
      assetIssuer: null,
      memo: 'course enrollment',
      successful: true,
    },
    {
      id: 'tx-stub-0002',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60002',
      createdAt: new Date(Date.now() - 172_800_000).toISOString(),
      type: 'payment',
      amount: '25.0000000',
      assetCode: 'USDC',
      assetIssuer: 'GISSUER-STUB-USDC',
      memo: 'badge mint',
      successful: true,
    },
    {
      id: 'tx-stub-0003',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60003',
      createdAt: new Date(Date.now() - 259_200_000).toISOString(),
      type: 'path_payment',
      amount: '50.0000000',
      assetCode: 'XLM',
      assetIssuer: null,
      memo: 'reward claim',
      successful: true,
    },
    {
      id: 'tx-stub-0004',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60004',
      createdAt: new Date(Date.now() - 345_600_000).toISOString(),
      type: 'create_account',
      amount: '1.0000000',
      assetCode: 'XLM',
      assetIssuer: null,
      memo: '',
      successful: true,
    },
  ];

  /** Hard cap to defend the stub from absurd limit queries. */
  private static readonly MAX_LIMIT = 100;
  private static readonly DEFAULT_LIMIT = 20;

  getTransactionHistory(query: TransactionHistoryQueryDto): TransactionHistoryResponse {
    const { account, limit, cursor } = query;

    let filtered = [...this.stubLedger];
    if (account) {
      filtered = filtered.filter((tx) => tx.account === account);
    }

    // Defensive clamp on limit. Real impl will rely on Horizon's own limits.
    const effectiveLimit = Math.min(
      Math.max(1, Number(limit) || PaymentsService.DEFAULT_LIMIT),
      PaymentsService.MAX_LIMIT,
    );

    // Cursor stub: parses as integer so the wire field is round-trippable
    // through this MVP. Real impl should swap to Horizon's opaque cursor.
    // A real Horizon cursor like "1234567890_abc..." will silently fall to
    // 0 here - acceptable as a stub-only quirk; the DTO already documents
    // that the field is opaque in production.
    const startIdx = cursor ? parseInt(cursor, 10) || 0 : 0;
    const page = filtered.slice(startIdx, startIdx + effectiveLimit);
    const remaining = filtered.length - (startIdx + page.length);

    const response: TransactionHistoryResponse = {
      entries: page,
      total: filtered.length,
    };
    if (remaining > 0) {
      response.nextCursor = String(startIdx + page.length);
    }
    return response;
  }
}
