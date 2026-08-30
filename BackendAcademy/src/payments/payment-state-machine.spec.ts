import { DatabaseService, PAYMENT_STATUSES, PaymentStatus } from '../database/database.service';
import { TransactionManagerService } from '../common/transaction-manager.service';

/**
 * Exhaustive payment state-machine coverage for BA-093 / #661.
 *
 * These tests assert that the centralized transition rules reject illegal
 * status regressions and terminal-state changes for *every* status, and that
 * duplicate provider events are treated as safe no-ops. Both the webhook
 * ingress path and any internal status update route through
 * `DatabaseService.updatePaymentStatus`, so exercising it here covers the
 * internal-update requirement directly.
 */
describe('Payment state machine (BA-093 / #661)', () => {
  describe('isLegalPaymentTransition', () => {
    it('matches the declared allowed transitions for every status pair', () => {
      for (const from of PAYMENT_STATUSES) {
        for (const to of PAYMENT_STATUSES) {
          const expected =
            from === to || DatabaseService.ALLOWED_TRANSITIONS[from].includes(to);
          expect(DatabaseService.isLegalPaymentTransition(from, to)).toBe(expected);
        }
      }
    });

    it('rejects regressions and terminal-state changes', () => {
      // succeeded -> pending is an illegal regression.
      expect(DatabaseService.isLegalPaymentTransition('succeeded', 'pending')).toBe(false);
      // failed is terminal: any onward change is illegal.
      expect(DatabaseService.isLegalPaymentTransition('failed', 'succeeded')).toBe(false);
      // refunded is terminal: any onward change is illegal.
      expect(DatabaseService.isLegalPaymentTransition('refunded', 'pending')).toBe(false);
      expect(DatabaseService.isLegalPaymentTransition('refunded', 'succeeded')).toBe(false);
    });
  });

  describe('isTerminalPaymentStatus', () => {
    it('marks failed and refunded as terminal', () => {
      expect(DatabaseService.isTerminalPaymentStatus('failed')).toBe(true);
      expect(DatabaseService.isTerminalPaymentStatus('refunded')).toBe(true);
    });

    it('marks pending, processing and succeeded as non-terminal', () => {
      expect(DatabaseService.isTerminalPaymentStatus('pending')).toBe(false);
      expect(DatabaseService.isTerminalPaymentStatus('processing')).toBe(false);
      expect(DatabaseService.isTerminalPaymentStatus('succeeded')).toBe(false);
    });
  });

  describe('updatePaymentStatus enforcement (internal updates)', () => {
    let db: DatabaseService;

    beforeEach(() => {
      db = new DatabaseService(new TransactionManagerService());
    });

    const seed = (id: string, status: PaymentStatus): void => {
      db.createPayment({
        id,
        orderId: 'ord-1',
        userId: 'user-1',
        status,
        amount: 100,
        assetCode: 'XLM',
        provider: 'stellar',
      });
    };

    PAYMENT_STATUSES.forEach((from) => {
      PAYMENT_STATUSES.forEach((to) => {
        it(`rejects illegal transition from ${from} -> ${to} via updatePaymentStatus`, async () => {
          const id = `pay-${from}-${to}`;
          seed(id, from);

          const result = await db.updatePaymentStatus(id, to, `evt-${from}-${to}`);

          if (from === to) {
            // Idempotent no-op: safe, but not a state change.
            expect(result.success).toBe(true);
            expect(result.transitioned).toBe(false);
          } else if (DatabaseService.ALLOWED_TRANSITIONS[from].includes(to)) {
            expect(result.success).toBe(true);
            expect(result.transitioned).toBe(true);
          } else {
            // Illegal regression / terminal change must be refused.
            expect(result.success).toBe(false);
            expect(result.transitioned).toBe(false);
            expect(result.reason).toMatch(/Illegal transition/i);
          }
        });
      });
    });

    it('treats a repeated provider event id as a safe no-op', async () => {
      seed('pay-dup', 'pending');
      const first = await db.updatePaymentStatus('pay-dup', 'succeeded', 'evt-dup');
      expect(first.success).toBe(true);
      expect(first.transitioned).toBe(true);

      const second = await db.updatePaymentStatus('pay-dup', 'succeeded', 'evt-dup');
      expect(second.success).toBe(true);
      expect(second.duplicateEvent).toBe(true);
      expect(second.transitioned).toBe(false);
    });
  });
});
