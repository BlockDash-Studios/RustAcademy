import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

export interface WalletOperation {
  id: string;
  type: string;
  createdAt: string;
  sourceAccount: string;
  transactionHash: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  from?: string;
  to?: string;
  memo?: string;
}

@Injectable()
export class HorizonService {
  constructor(private readonly stellar: StellarService) {}

  async getAccount(publicKey: string) {
    this.assertPublicKey(publicKey);
    try {
      const account = await this.stellar.server.loadAccount(publicKey);
      return {
        accountId: account.accountId(),
        sequence: account.sequence,
        balances: account.balances.map((balance) => {
          // Liquidity-pool-share balances carry neither asset_code nor
          // asset_issuer; only credit balances do, so narrow on asset_type
          // before reading them.
          const isNative = balance.asset_type === 'native';
          const isLiquidityPool = balance.asset_type === 'liquidity_pool_shares';
          const credit = isNative || isLiquidityPool ? undefined : balance;
          return {
            assetCode: isNative ? 'XLM' : credit?.asset_code,
            assetIssuer: credit?.asset_issuer,
            amount: balance.balance,
          };
        }),
      };
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        throw new NotFoundException('Stellar account not found');
      }
      throw new ServiceUnavailableException('Unable to fetch Stellar account');
    }
  }

  async getHistory(publicKey: string, limit = 20, cursor?: string) {
    this.assertPublicKey(publicKey);
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    try {
      let request = this.stellar.server.operations().forAccount(publicKey).order('desc').limit(safeLimit);
      if (cursor) request = request.cursor(cursor);
      const page = await request.call();
      const operations = (page.records as unknown as Array<Record<string, unknown>>).map((record) =>
        this.normalizeOperation(record),
      );
      return {
        accountId: publicKey,
        operations,
        nextCursor:
          page.records.length > 0
            ? String(page.records[page.records.length - 1].paging_token ?? operations[operations.length - 1].id)
            : null,
      };
    } catch {
      throw new ServiceUnavailableException('Unable to fetch Stellar transaction history');
    }
  }

  private assertPublicKey(publicKey: string): void {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new BadRequestException('Invalid Stellar account ID');
    }
  }

  private normalizeOperation(record: Record<string, unknown>): WalletOperation {
    const transaction = record.transaction as Record<string, unknown> | undefined;
    return {
      id: String(record.id),
      type: String(record.type),
      createdAt: String(record.created_at),
      sourceAccount: String(record.source_account),
      transactionHash: String(record.transaction_hash ?? transaction?.hash ?? ''),
      amount: record.amount == null ? undefined : String(record.amount),
      assetCode: record.asset_type === 'native' ? 'XLM' : record.asset_code as string | undefined,
      assetIssuer: record.asset_issuer as string | undefined,
      from: record.from as string | undefined,
      to: record.to as string | undefined,
      memo: transaction?.memo as string | undefined,
    };
  }
}