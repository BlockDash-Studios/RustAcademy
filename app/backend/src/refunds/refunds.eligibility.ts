import {
  PaymentDbStatus,
  EscrowDbStatus,
} from '../supabase/supabase.service';
import { LinkState } from '../links/link-state-machine';

export { PaymentDbStatus, EscrowDbStatus };

export function isPaymentRefundable(status: PaymentDbStatus): boolean {
  return status === PaymentDbStatus.Paid;
}

export function isEscrowRefundable(status: EscrowDbStatus): boolean {
  return status === EscrowDbStatus.Active || status === EscrowDbStatus.Claimed;
}

export function isLinkRefundable(state: LinkState): boolean {
  return state === LinkState.PAID;
}
