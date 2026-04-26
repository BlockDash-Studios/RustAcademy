export enum AuditAction {
  API_KEY_CREATE = 'api_key.create',
  API_KEY_REVOKE = 'api_key.revoke',
  API_KEY_ROTATE = 'api_key.rotate',
  WEBHOOK_CREATE = 'webhook.create',
  WEBHOOK_UPDATE = 'webhook.update',
  WEBHOOK_DELETE = 'webhook.delete',
  REFUND_INITIATE = 'refund.initiate',
  REFUND_APPROVE = 'refund.approve',
  REFUND_REJECT = 'refund.reject',
  DISPUTE_OPEN = 'dispute.open',
  DISPUTE_RESOLVE = 'dispute.resolve',
  ADMIN_SETTING_UPDATE = 'admin.setting_update',
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  target: string;
  metadata: Record<string, any>;
  request_id: string;
  created_at: string;
}
