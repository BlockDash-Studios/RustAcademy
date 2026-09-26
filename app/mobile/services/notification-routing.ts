import type { Router } from "expo-router";
import type { NotificationResponse } from "expo-notifications";

import {
  PUSH_NOTIFICATION_TYPES,
  type PushNotificationPayload,
} from "../types/push-notification";

// Type guards used to safely narrow the untyped `data` payload that
// comes back from a push notification before trusting any of its fields.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Validates and narrows an arbitrary push notification data payload into
// a known PushNotificationPayload shape, returning null if it doesn't
// match any recognized notification type or is missing its required
// identifying field (transactionId/escrowId/listingId). Optional fields
// are only included if they're present and non-empty; otherwise they're
// left undefined so downstream code can apply its own defaults.
export function parsePushNotificationPayload(
  value: unknown,
): PushNotificationPayload | null {
  if (!isObject(value) || !isNonEmptyString(value.type)) return null;

  if (
    value.type === PUSH_NOTIFICATION_TYPES.transactionDetail &&
    isNonEmptyString(value.transactionId)
  ) {
    return {
      type: PUSH_NOTIFICATION_TYPES.transactionDetail,
      transactionId: value.transactionId,
      txHash: isNonEmptyString(value.txHash) ? value.txHash : undefined,
      amount: isNonEmptyString(value.amount) ? value.amount : undefined,
      asset: isNonEmptyString(value.asset) ? value.asset : undefined,
      status: isNonEmptyString(value.status) ? value.status : undefined,
    };
  }

  if (
    value.type === PUSH_NOTIFICATION_TYPES.escrowDetail &&
    isNonEmptyString(value.escrowId)
  ) {
    return {
      type: PUSH_NOTIFICATION_TYPES.escrowDetail,
      escrowId: value.escrowId,
      status: isNonEmptyString(value.status) ? value.status : undefined,
    };
  }

  if (
    value.type === PUSH_NOTIFICATION_TYPES.listingDetail &&
    isNonEmptyString(value.listingId)
  ) {
    return {
      type: PUSH_NOTIFICATION_TYPES.listingDetail,
      listingId: value.listingId,
      sellerId: isNonEmptyString(value.sellerId) ? value.sellerId : undefined,
    };
  }

  return null;
}

// Navigates to the screen corresponding to a validated push notification
// payload, filling in sensible placeholder values for any optional
// fields that weren't present in the payload (e.g. defaulting amount to
// "0", asset to "XLM", status to "Success"/"open") so the destination
// screen always receives a complete set of params even from a minimal
// notification payload.
export function routeFromPushPayload(
  router: Router,
  payload: PushNotificationPayload,
) {
  if (payload.type === PUSH_NOTIFICATION_TYPES.transactionDetail) {
    router.push({
      pathname: "/transaction/[id]",
      params: {
        id: payload.transactionId,
        txHash: payload.txHash ?? payload.transactionId,
        amount: payload.amount ?? "0",
        asset: payload.asset ?? "XLM",
        status: payload.status ?? "Success",
        timestamp: new Date().toISOString(),
        source: "notification",
        destination: "notification",
      },
    });
    return;
  }

  if (payload.type === PUSH_NOTIFICATION_TYPES.escrowDetail) {
    router.push({
      pathname: "/escrow/[id]",
      params: { id: payload.escrowId, status: payload.status ?? "open" },
    });
    return;
  }

  // Remaining case: listingDetail (payload.type has been narrowed down
  // to this by process of elimination after the two checks above).
  router.push({
    pathname: "/listing/[id]",
    params: { id: payload.listingId, sellerId: payload.sellerId ?? "unknown" },
  });
}

// Top-level entry point for handling a tapped push notification: pulls
// the raw data out of the notification response, parses/validates it,
// and routes to the matching screen if valid. Returns false (without
// navigating) if the response has no notification data or it doesn't
// match a recognized payload shape, so callers can distinguish "handled"
// from "nothing to do here."
export function routeFromNotificationResponse(
  router: Router,
  response: NotificationResponse | null | undefined,
) {
  const payload = parsePushNotificationPayload(
    response?.notification?.request?.content?.data,
  );
  if (!payload) return false;
  routeFromPushPayload(router, payload);
  return true;
}