import { Injectable } from "@nestjs/common";
import {
  NotificationPayload,
  PaymentReceivedPayload,
  UsernameClaimedPayload,
  RecurringPaymentDuePayload,
  RecurringPaymentExecutedPayload,
  RecurringPaymentFailedPayload,
  RecurringLinkStatusPayload,
} from "./types/notification.types";

@Injectable()
export class NotificationTemplateService {
  /**
   * Render title and body for a notification event.
   */
  render(payload: NotificationPayload): { title: string; body: string } {
    switch (payload.eventType) {
      case "EscrowDeposited":
        return {
          title: "Escrow Deposit Confirmed",
          body: `Your escrow of ${this.formatAmount(payload.amountStroops)} has been deposited.`,
        };

      case "EscrowWithdrawn":
        return {
          title: "Escrow Withdrawn",
          body: `Your escrow of ${this.formatAmount(payload.amountStroops)} has been released.`,
        };

      case "EscrowRefunded":
        return {
          title: "Escrow Refunded",
          body: `Your escrow of ${this.formatAmount(payload.amountStroops)} has been refunded.`,
        };

      case "payment.received": {
        const p = payload as PaymentReceivedPayload;
        return {
          title: "Payment Received",
          body: `You received ${this.formatAmount(p.amountStroops)} from ${p.sender.slice(0, 8)}...`,
        };
      }

      case "username.claimed": {
        const p = payload as UsernameClaimedPayload;
        return {
          title: "Username Registered",
          body: `Your username @${p.username} has been successfully registered.`,
        };
      }

      case "recurring.payment.due": {
        const p = payload as RecurringPaymentDuePayload;
        return {
          title: "Recurring Payment Due",
          body: `A payment of ${p.amount} ${p.asset} is scheduled for today.`,
        };
      }

      case "recurring.payment.executed": {
        const p = payload as RecurringPaymentExecutedPayload;
        return {
          title: "Recurring Payment Executed",
          body: `A payment of ${p.amount} ${p.asset} was successfully sent to ${p.username || p.destination}.`,
        };
      }

      case "recurring.payment.failed": {
        const p = payload as RecurringPaymentFailedPayload;
        return {
          title: "Recurring Payment Failed",
          body: `Payment of ${p.amount} ${p.asset} failed: ${p.failureReason}`,
        };
      }

      case "recurring.link.created":
      case "recurring.link.paused":
      case "recurring.link.resumed":
      case "recurring.link.completed": {
        const p = payload as RecurringLinkStatusPayload;
        const titles: Record<string, string> = {
          "recurring.link.created": "Recurring Payment Created",
          "recurring.link.paused": "Recurring Payment Paused",
          "recurring.link.resumed": "Recurring Payment Resumed",
          "recurring.link.completed": "Recurring Payment Completed",
        };
        const actions: Record<string, string> = {
          "recurring.link.created": "has been set up",
          "recurring.link.paused": "is now paused",
          "recurring.link.resumed": "has been resumed",
          "recurring.link.completed": "is now complete",
        };
        return {
          title: titles[p.eventType] || "Recurring Payment Update",
          body: `Your recurring payment to ${p.username || p.destination} ${actions[p.eventType] || "has been updated"}.`,
        };
      }

      default:
        return {
          title: payload.title || "New Notification",
          body: payload.body || "You have a new notification.",
        };
    }
  }

  private formatAmount(stroops: bigint): string {
    const xlm = Number(stroops) / 10_000_000;
    return xlm.toFixed(7) + " XLM";
  }
}
