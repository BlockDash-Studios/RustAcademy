import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type {
  ReferralRecord,
  ReferralStatus,
  ReferralSummaryResponse,
  ReferralUpdateResponse,
} from './interfaces/referral.interfaces';
import {
  REFERRAL_BONUS_XLM,
  REFERRAL_CURRENCY,
  REFERRAL_EXPIRY_DAYS,
  MAX_PENDING_REFERRALS_PER_USER,
} from './referral.constants';

/**
 * In-memory referral store used until a persistence layer is wired in.
 *
 * Keyed by referralId → ReferralRecord.
 * Replace this Map with a TypeORM / Prisma repository call in production —
 * the service interface will remain unchanged.
 */
const referralStore = new Map<string, ReferralRecord>();

/**
 * Generate a simple, unique referral ID.
 * In production, prefer UUIDs (e.g. via the `uuid` package).
 */
function generateReferralId(): string {
  return `ref_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Return all records where referrerId matches.
 */
function getRecordsByReferrer(referrerId: string): ReferralRecord[] {
  return Array.from(referralStore.values()).filter(
    (r) => r.referrerId === referrerId,
  );
}

/**
 * Expire any pending referrals that have passed REFERRAL_EXPIRY_DAYS.
 * Called lazily before reads so callers always see up-to-date statuses
 * without a background scheduler.
 */
function expireStalePendingReferrals(now: Date): void {
  if (REFERRAL_EXPIRY_DAYS <= 0) return;

  const expiryMs = REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  for (const [id, record] of referralStore.entries()) {
    if (record.status !== 'pending') continue;

    const createdAt = new Date(record.createdAt);
    if (now.getTime() - createdAt.getTime() > expiryMs) {
      referralStore.set(id, { ...record, status: 'expired' });
    }
  }
}

@Injectable()
export class ReferralService {
  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Records a new referral when a user registers via another user's invite link.
   *
   * Rules enforced:
   *  - A referrer cannot refer themselves.
   *  - A user can only be a referee once (duplicate referee IDs are rejected).
   *  - The referrer must not exceed MAX_PENDING_REFERRALS_PER_USER pending
   *    referrals (anti-farming guard).
   *
   * @param referrerId   User ID of the person who shared the invite link
   * @param refereeId    User ID of the newly registered user
   * @param bonusAmount  Override the default XLM bonus (optional)
   * @returns            The newly created ReferralRecord
   */
  createReferral(
    referrerId: string,
    refereeId: string,
    bonusAmount: number = REFERRAL_BONUS_XLM,
  ): ReferralRecord {
    if (referrerId === refereeId) {
      throw new ConflictException('A user cannot refer themselves.');
    }

    if (bonusAmount <= 0) {
      throw new Error('Bonus amount must be a positive number.');
    }

    // Check for duplicate referee
    const alreadyReferred = Array.from(referralStore.values()).some(
      (r) => r.refereeId === refereeId,
    );
    if (alreadyReferred) {
      throw new ConflictException(
        `User '${refereeId}' has already been referred.`,
      );
    }

    // Enforce pending-referral cap
    if (MAX_PENDING_REFERRALS_PER_USER > 0) {
      const pendingCount = getRecordsByReferrer(referrerId).filter(
        (r) => r.status === 'pending',
      ).length;

      if (pendingCount >= MAX_PENDING_REFERRALS_PER_USER) {
        throw new ConflictException(
          `Referrer '${referrerId}' has reached the maximum of ` +
            `${MAX_PENDING_REFERRALS_PER_USER} pending referrals.`,
        );
      }
    }

    const id = generateReferralId();
    const record: ReferralRecord = {
      id,
      referrerId,
      refereeId,
      status: 'pending',
      bonusAmount,
      currency: REFERRAL_CURRENCY,
      createdAt: new Date().toISOString(),
      qualifiedAt: null,
      paidAt: null,
    };

    referralStore.set(id, record);
    return record;
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Returns the full referral summary for a given referrer, including
   * aggregated stats and all individual referral records.
   *
   * Lazy-expires stale pending referrals before computing stats.
   *
   * @throws NotFoundException if the referrer has no referral records at all
   */
  getReferralSummary(referrerId: string): ReferralSummaryResponse {
    expireStalePendingReferrals(new Date());

    const records = getRecordsByReferrer(referrerId);
    if (records.length === 0) {
      throw new NotFoundException(
        `No referral records found for referrer '${referrerId}'.`,
      );
    }

    const paidRecords = records.filter((r) => r.status === 'paid');
    const pendingXlm = records
      .filter((r) => r.status === 'qualified')
      .reduce((sum, r) => sum + r.bonusAmount, 0);

    return {
      referrerId,
      totalReferrals: records.length,
      paidReferrals: paidRecords.length,
      totalXlmEarned: paidRecords.reduce((sum, r) => sum + r.bonusAmount, 0),
      pendingXlm,
      referrals: records,
    };
  }

  /**
   * Returns a single referral record by its ID.
   *
   * @throws NotFoundException if the referral ID is unknown
   */
  getReferral(referralId: string): ReferralRecord {
    const record = referralStore.get(referralId);
    if (!record) {
      throw new NotFoundException(
        `Referral '${referralId}' not found.`,
      );
    }
    return record;
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  /**
   * Marks a referral as 'qualified' after the referee has completed the
   * qualifying action (e.g. first graded task submission).
   *
   * Only transitions from 'pending' → 'qualified' are valid.
   * Calling this on an already-qualified or paid referral is a no-op
   * that returns the current state (idempotent).
   *
   * @param referralId  ID of the referral to qualify
   * @param qualifiedAt Override timestamp (defaults to now)
   * @throws NotFoundException if the referral ID is unknown
   * @throws ConflictException if the referral has already expired
   */
  qualifyReferral(
    referralId: string,
    qualifiedAt: Date = new Date(),
  ): ReferralUpdateResponse {
    const record = this.getReferral(referralId);

    if (record.status === 'expired') {
      throw new ConflictException(
        `Referral '${referralId}' has expired and can no longer be qualified.`,
      );
    }

    // Idempotent for already-qualified or paid
    if (record.status === 'qualified' || record.status === 'paid') {
      return this._toUpdateResponse(record);
    }

    const updated: ReferralRecord = {
      ...record,
      status: 'qualified',
      qualifiedAt: qualifiedAt.toISOString(),
    };
    referralStore.set(referralId, updated);
    return this._toUpdateResponse(updated);
  }

  /**
   * Marks a referral as 'paid' after the on-chain XLM transfer is confirmed.
   *
   * Only transitions from 'qualified' → 'paid' are valid.
   * Calling this on an already-paid referral is idempotent.
   *
   * @param referralId  ID of the referral to mark as paid
   * @param paidAt      Override timestamp (defaults to now)
   * @throws NotFoundException  if the referral ID is unknown
   * @throws ConflictException  if the referral is not in 'qualified' status
   */
  payReferral(
    referralId: string,
    paidAt: Date = new Date(),
  ): ReferralUpdateResponse {
    const record = this.getReferral(referralId);

    // Idempotent for already-paid
    if (record.status === 'paid') {
      return this._toUpdateResponse(record);
    }

    if (record.status !== 'qualified') {
      throw new ConflictException(
        `Referral '${referralId}' must be in 'qualified' status before it can be paid. ` +
          `Current status: '${record.status}'.`,
      );
    }

    const updated: ReferralRecord = {
      ...record,
      status: 'paid',
      paidAt: paidAt.toISOString(),
    };
    referralStore.set(referralId, updated);
    return this._toUpdateResponse(updated);
  }

  // -------------------------------------------------------------------------
  // Test / admin helpers
  // -------------------------------------------------------------------------

  /**
   * Clears all referral data.  Only for use in tests and admin tooling.
   */
  clearAll(): void {
    referralStore.clear();
  }

  /**
   * Returns the raw referral record by ID (for tests that need direct access).
   */
  getRecord(referralId: string): ReferralRecord | undefined {
    return referralStore.get(referralId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _toUpdateResponse(record: ReferralRecord): ReferralUpdateResponse {
    return {
      referralId: record.id,
      newStatus: record.status as ReferralStatus,
      bonusAmount: record.bonusAmount,
      currency: record.currency,
      qualifiedAt: record.qualifiedAt,
      paidAt: record.paidAt,
    };
  }
}
