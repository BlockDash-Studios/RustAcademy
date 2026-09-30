/**
 * Storage schema documentation for API key metadata.
 *
 * The API key record layout is defined by {@link ApiKeyRecord} and persisted
 * by the api-keys storage layer. Keep this metadata in sync with the storage
 * schema and its tests.
 *
 * @see ApiKeyRecord
 * @see ApiKeyPublic
 * @see ApiKeyCreated
 */
export const API_KEY_SCOPES = [
  'links:read',
  'links:write',
  'transactions:read',
  'usernames:read',
  'refunds:write',
  'admin', // Admin scope for job queue management and other admin operations
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_hash: string;
  key_hash_old: string | null;
  key_prefix: string;
  scopes: ApiKeyScope[];
  owner_id: string | null;
  organization_id: string | null;
  is_active: boolean;
  request_count: number;
  monthly_quota: number;
  last_used_at: string | null;
  rotated_at: string | null;
  last_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyPublic {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  is_active: boolean;
  request_count: number;
  monthly_quota: number;
  last_used_at: string | null;
  created_at: string;
}

/** Returned once at creation / rotation — contains the raw key. */
export interface ApiKeyCreated extends ApiKeyPublic {
  key: string;
}
