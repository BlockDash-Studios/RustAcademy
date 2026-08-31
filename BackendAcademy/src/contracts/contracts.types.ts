export type PayoutRole = 'ADMIN' | 'TREASURY';
export type PayoutStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface PayoutActor {
  id: string;
  role: PayoutRole;
}

export interface Payout {
  id: string;
  recipientId: string;
  amount: number;
  status: PayoutStatus;
  createdBy: string;
  createdAt: Date;
  releasedBy?: string;
  releasedAt?: Date;
}

export interface PayoutAuditEntry {
  action: 'CREATE' | 'RELEASE' | 'FAIL';
  payoutId: string;
  actorId: string;
  actorRole: PayoutRole;
  outcome: 'SUCCESS' | 'DENIED' | 'REJECTED';
  reason?: string;
  createdAt: Date;
}