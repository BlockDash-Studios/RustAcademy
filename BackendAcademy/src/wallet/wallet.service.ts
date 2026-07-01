import { BadRequestException, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RegisterWalletDto, VerifyTransactionDto } from './dto/verify-transaction.dto';
import {
  TransactionVerificationResult,
  WalletAccount,
  WalletBalance,
  WalletTransaction,
} from './interfaces/wallet.interface';

@Injectable()
export class WalletService {
  private readonly wallets = new Map<string, WalletAccount>();
  private readonly transactions = new Map<string, WalletTransaction>();
  private readonly verificationResults = new Map<string, TransactionVerificationResult>();

  async registerWallet(dto: RegisterWalletDto): Promise<WalletAccount> {
    if (this.wallets.has(dto.address)) {
      throw new BadRequestException({
        error: 'WALLET_ALREADY_REGISTERED',
        message: `Wallet ${dto.address} is already registered`,
      });
    }

    const account: WalletAccount = {
      address: dto.address,
      balance: '0.00',
      assetCode: dto.assetCode,
      createdAt: new Date(),
    };

    this.wallets.set(dto.address, account);
    return account;
  }

  async verifyTransaction(
    dto: VerifyTransactionDto,
  ): Promise<TransactionVerificationResult> {
    this.validateStellarAddress(dto.sourceAccount);
    this.validateStellarAddress(dto.destinationAccount);

    if (dto.sourceAccount === dto.destinationAccount) {
      throw new BadRequestException({
        error: 'SAME_ACCOUNT_TRANSFER',
        message: 'Source and destination accounts cannot be the same',
      });
    }

    const amount = parseFloat(dto.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException({
        error: 'INVALID_AMOUNT',
        message: 'Transaction amount must be a positive number',
      });
    }

    const sourceWallet = this.wallets.get(dto.sourceAccount);
    const sourceBalance = parseFloat(sourceWallet?.balance ?? '0');

    const fee = 0.00001;
    const totalRequired = amount + fee;

    let verified: boolean;
    let status: TransactionVerificationResult['status'];
    let message: string;

    if (!sourceWallet) {
      verified = false;
      status = 'rejected';
      message = `Source account ${dto.sourceAccount} is not registered`;
    } else if (sourceBalance < totalRequired) {
      verified = false;
      status = 'rejected';
      message = `Insufficient balance. Required: ${totalRequired.toFixed(5)}, available: ${sourceBalance.toFixed(5)}`;
    } else if (amount > 1000) {
      verified = true;
      status = 'pending';
      message = `Transaction of ${amount} ${dto.assetCode} requires additional verification`;
    } else {
      verified = true;
      status = 'verified';
      message = 'Transaction verified successfully';

      sourceWallet.balance = (sourceBalance - totalRequired).toFixed(5);
      const destWallet = this.wallets.get(dto.destinationAccount);
      if (destWallet) {
        destWallet.balance = (parseFloat(destWallet.balance) + amount).toFixed(5);
      }
    }

    const result: TransactionVerificationResult = {
      transactionId: dto.transactionId,
      verified,
      status,
      message,
      verifiedAt: new Date(),
      details: {
        sourceBalance: sourceBalance.toFixed(5),
        destinationBalance: (this.wallets.get(dto.destinationAccount)?.balance ?? '0.00'),
        fee: fee.toString(),
        networkPassphrase: 'Test SDF Network ; September 2015',
      },
    };

    this.verificationResults.set(dto.transactionId, result);

    if (verified) {
      const walletTx: WalletTransaction = {
        transactionId: dto.transactionId,
        sourceAccount: dto.sourceAccount,
        destinationAccount: dto.destinationAccount,
        amount: dto.amount,
        assetCode: dto.assetCode,
        memo: dto.memo,
        hash: this.generateHash(),
        status: status === 'verified' ? 'completed' : 'pending',
        createdAt: new Date(),
        completedAt: status === 'verified' ? new Date() : undefined,
      };
      this.transactions.set(dto.transactionId, walletTx);
    }

    return result;
  }

  async getWallet(address: string): Promise<WalletAccount> {
    const wallet = this.wallets.get(address);
    if (!wallet) {
      throw new BadRequestException({
        error: 'WALLET_NOT_FOUND',
        message: `Wallet ${address} not found`,
      });
    }
    return wallet;
  }

  async getWalletBalance(address: string): Promise<WalletBalance> {
    const wallet = this.wallets.get(address);

    const balances: WalletBalance['balances'] = [];
    if (wallet) {
      balances.push({
        assetCode: wallet.assetCode,
        amount: wallet.balance,
      });
    }

    // Always include native XLM balance
    balances.push({
      assetCode: 'XLM',
      amount: wallet ? wallet.balance : '0.00',
      assetIssuer: 'native',
    });

    return {
      address,
      balances,
      lastUpdated: new Date(),
    };
  }

  async getTransactionHistory(address: string): Promise<WalletTransaction[]> {
    const txs: WalletTransaction[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.sourceAccount === address || tx.destinationAccount === address) {
        txs.push(tx);
      }
    }
    return txs.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async getVerificationStatus(
    transactionId: string,
  ): Promise<TransactionVerificationResult | null> {
    return this.verificationResults.get(transactionId) ?? null;
  }

  async getAllWallets(): Promise<WalletAccount[]> {
    return Array.from(this.wallets.values());
  }

  private validateStellarAddress(address: string): void {
    if (!address || !address.trim()) {
      throw new BadRequestException({
        error: 'INVALID_ADDRESS',
        message: 'Stellar address is required',
      });
    }
    if (!address.startsWith('G') || address.length !== 56) {
      throw new BadRequestException({
        error: 'INVALID_ADDRESS',
        message: 'Address must be a valid Stellar public key starting with G',
      });
    }
  }

  private generateHash(): string {
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
  }
}
