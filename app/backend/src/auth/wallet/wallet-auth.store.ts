import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { WalletNonce, WalletSession } from './wallet-auth.types';

/**
 * Storage for wallet nonces and refresh-token families.
 *
 * Follows the pattern already established by `AuditService`: the in-process
 * map is authoritative for the current instance, and every write is mirrored
 * to Supabase on a best-effort basis. If Supabase is unreachable the flow keeps
 * working rather than failing authentication outright, and the degradation is
 * logged.
 *
 * Consequence worth stating plainly: with more than one backend instance and
 * Supabase unavailable, a session revoked on one instance is not visible to the
 * others until connectivity returns. Revocation is therefore best-effort across
 * instances, which is why reuse detection also revokes locally on the instance
 * that observes it.
 */
@Injectable()
export class WalletAuthStore {
  private readonly logger = new Logger(WalletAuthStore.name);
  private readonly nonces = new Map<string, WalletNonce>();
  private readonly sessions = new Map<string, WalletSession>();

  constructor(private readonly supabaseService?: SupabaseService) {}

  // -- nonces ---------------------------------------------------------------

  async saveNonce(nonce: WalletNonce): Promise<void> {
    this.nonces.set(nonce.id, nonce);
    await this.mirror('wallet_auth_nonces', {
      id: nonce.id,
      value: nonce.value,
      wallet_address: nonce.walletAddress,
      issued_at: nonce.issuedAt.toISOString(),
      expires_at: nonce.expiresAt.toISOString(),
      consumed_at: nonce.consumedAt?.toISOString() ?? null,
    });
  }

  async findNonce(id: string): Promise<WalletNonce | undefined> {
    return this.nonces.get(id);
  }

  /** Remove nonces whose expiry has passed. Consumed nonces are kept until
   *  expiry so that a replay is reported as a replay, not as "not found". */
  pruneExpiredNonces(now: Date = new Date()): number {
    let removed = 0;
    for (const [id, nonce] of this.nonces) {
      if (nonce.expiresAt.getTime() <= now.getTime()) {
        this.nonces.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  // -- sessions -------------------------------------------------------------

  async saveSession(session: WalletSession): Promise<void> {
    this.sessions.set(session.id, session);
    await this.mirror('wallet_auth_sessions', {
      id: session.id,
      wallet_address: session.walletAddress,
      token_hash: session.tokenHash,
      generation: session.generation,
      created_at: session.createdAt.toISOString(),
      expires_at: session.expiresAt.toISOString(),
      last_rotated_at: session.lastRotatedAt.toISOString(),
      revoked_at: session.revokedAt?.toISOString() ?? null,
      revoked_reason: session.revokedReason ?? null,
    });
  }

  async findSession(id: string): Promise<WalletSession | undefined> {
    return this.sessions.get(id);
  }

  /** All sessions for a wallet, used to revoke every family on logout. */
  async findSessionsByWallet(walletAddress: string): Promise<WalletSession[]> {
    return Array.from(this.sessions.values()).filter(
      session => session.walletAddress === walletAddress,
    );
  }

  // -- internals ------------------------------------------------------------

  /**
   * Best-effort mirror to Supabase. Never throws: an auth flow must not fail
   * because the audit-side persistence is unavailable.
   */
  private async mirror(table: string, row: Record<string, unknown>): Promise<void> {
    if (!this.supabaseService) return;

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client.from(table).upsert(row);
      if (error) {
        this.logger.warn(`Failed to persist ${table} row: ${error.message}`);
      }
    } catch (error) {
      this.logger.warn(
        `Wallet auth store unavailable, keeping in-memory copy only: ${
          (error as Error).message
        }`,
      );
    }
  }
}
