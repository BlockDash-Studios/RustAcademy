export enum PayoutStatus {
  Pending = "pending",
  Released = "released",
  Failed = "failed",
}

export interface Payout {
  id: string;
  destinationAddress: string;
  amount: number;
  status: PayoutStatus;
  createdAt: Date;
  updatedAt: Date;
}
