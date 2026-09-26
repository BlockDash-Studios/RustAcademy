import * as Notifications from "expo-notifications";

import {
  PUSH_NOTIFICATION_TYPES,
  type PushNotificationPayload,
} from "../types/push-notification";

// Ensures the notification handler is only registered once per process,
// even if configureNotificationSimulator is called multiple times.
let handlerConfigured = false;

// Registers how incoming notifications should be presented while the app
// is in the foreground: shown as a banner and in the notification list,
// but without sound or a badge update. Used to preview/simulate push
// notifications locally (e.g. in dev/testing) rather than relying on
// real push delivery.
export function configureNotificationSimulator() {
  if (handlerConfigured) return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Simulates receiving a push notification locally for a given payload:
// ensures the handler is configured, requests notification permissions
// if not already granted (bailing out silently if the user declines),
// and then schedules an immediate local notification (trigger: null
// means "fire right away") with a title/body derived from the payload
// and the payload itself attached as the notification's data.
export async function scheduleNotificationSimulation(
  payload: PushNotificationPayload,
) {
  configureNotificationSimulator();
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notificationTitle(payload),
      body: notificationBody(payload),
      data: payload,
    },
    trigger: null,
  });
}

// Picks a short, generic title based on the payload's notification type.
function notificationTitle(payload: PushNotificationPayload): string {
  if (payload.type === PUSH_NOTIFICATION_TYPES.transactionDetail) {
    return "Transaction update";
  }
  if (payload.type === PUSH_NOTIFICATION_TYPES.escrowDetail) {
    return "Escrow update";
  }
  return "Listing update";
}

// Builds the notification body text, referencing the specific
// transaction/escrow/listing id the payload points to.
function notificationBody(payload: PushNotificationPayload): string {
  if (payload.type === PUSH_NOTIFICATION_TYPES.transactionDetail) {
    return `Open transaction ${payload.transactionId}`;
  }
  if (payload.type === PUSH_NOTIFICATION_TYPES.escrowDetail) {
    return `Open escrow ${payload.escrowId}`;
  }
  return `Open listing ${payload.listingId}`;
}