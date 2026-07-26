export interface PathHop {
  assetCode: string;
  assetIssuer: string | null;
  amount: string;
}

export interface PathQuote {
  sourceAmount: string;
  destinationAmount: string;
  hops: PathHop[];
  estimatedSettleSeconds: number;
  error?: string;
}