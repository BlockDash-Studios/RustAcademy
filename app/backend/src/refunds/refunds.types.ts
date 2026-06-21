export type RefundableEntityType = 'payment' | 'escrow' | 'link';

export type RefundStatus = 'pending' | 'approved' | 'submitted' | 'confirmed' | 'failed' | 'rejected';

export type RefundReasonCode =
  | 'DUPLICATE'
  | 'FRAUD'
  | 'CUSTOMER_REQUEST'
  | 'TECHNICAL_ERROR';

export interface RefundAttemptRecord {
  id: string;
  idempotency_key: string;
  entity_type: RefundableEntityType;
  entity_id: string;
  reason_code: RefundReasonCode;
  notes: string | null;
  status: RefundStatus;
  actor_id: string;
  created_at: string;
  updated_at: string;
  on_chain_tx_hash: string | null;
  contract_id: string | null;
  network: string | null;
  failure_reason: string | null;
  retry_count: number;
  last_attempted_at: string | null;
  is_retryable: boolean;
}

export interface RefundAuditRecord {
  id: string;
  refund_id: string;
  actor_id: string;
  action: string;
  reason_code: RefundReasonCode | null;
  notes: string | null;
  created_at: string;
}
