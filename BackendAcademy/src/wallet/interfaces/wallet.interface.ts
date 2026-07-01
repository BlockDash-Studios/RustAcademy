export interface WalletAccount {
  address: string;
  balance: string;
  assetCode: string;
  createdAt: Date;
}

export interface TransactionVerificationRequest {
  transactionId: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  assetCode: string;
  memo?: string;
}

export interface TransactionVerificationResult {
  transactionId: string;
  verified: boolean;
  status: 'pending' | 'verified' | 'rejected' | 'failed';
  message: string;
  verifiedAt: Date;
  details?: {
    sourceBalance: string;
    destinationBalance: string;
    fee: string;
    networkPassphrase: string;
  };
}

export interface WalletTransaction {
  transactionId: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  assetCode: string;
  memo?: string;
  hash?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface WalletBalance {
  address: string;
  balances: Array<{
    assetCode: string;
    amount: string;
    assetIssuer?: string;
  }>;
  lastUpdated: Date;
}
