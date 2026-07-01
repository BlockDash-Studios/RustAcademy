export interface PathHop {
  /** Type of operation: source -> destination asset. */
  assetCode: string;
  /** `null` when asset is native XLM. */
  assetIssuer: string | null;
  /** Stringified decimal for the amount at this hop. */
  amount: string;
}

export interface PathQuote {
  sourceAmount: string;
  destinationAmount: string;
  hops: PathHop[];
  /** Estimated time to settle on the Stellar network, in seconds. */
  estimatedSettleSeconds: number;
}
