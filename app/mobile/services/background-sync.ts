import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";

import type { PaymentNotification } from "../components/notifications/types/notification";
import { fetchTransactions } from "./transactions";
import { getWalletSession } from "./wallet-session";
import type { TransactionItem } from "../types/transaction";

// How often background sync should run, when triggered by the OS's own
// background-task scheduler rather than an explicit foreground/manual sync.
export type SyncFrequency = "battery-saver" | "balanced" | "frequent";
// What triggered a given sync attempt, used for logging/branching logic
// (e.g. background syncs respect the "enabled" setting; others don't).
export type SyncReason = "app-launch" | "foreground" | "manual" | "background";

// User-configurable sync preferences, persisted to AsyncStorage.
export interface BackgroundSyncSettings {
  enabled: boolean;
  badgeEnabled: boolean;
  wifiOnly: boolean;
  frequency: SyncFrequency;
}

// Locally cached view of the wallet's notifications/activity, plus sync
// bookkeeping timestamps. This is what the app reads/renders between syncs.
export interface SyncSnapshot {
  currentAccountId: string | null;
  notifications: PaymentNotification[];
  recentActivity: TransactionItem[];
  lastSyncedAt: number | null;
  lastSuccessfulSyncAt: number | null;
  initialSyncCompleted: boolean;
}

// Outcome of a single sync attempt: whether it actually fetched new data,
// was skipped (and why), or failed, always returning the resulting
// snapshot (updated snapshot on success, otherwise the prior one).
export interface SyncExecutionResult {
  status: "updated" | "skipped" | "failed";
  reason: SyncReason;
  detail?:
    | "disabled"
    | "no-wallet"
    | "offline"
    | "wifi-required"
    | "unavailable"
    | "fetch-failed";
  error?: string;
  snapshot: SyncSnapshot;
}

// AsyncStorage keys for persisted settings/snapshot data, and the name
// registered with the OS background task scheduler.
// Note: these keys have a leading space (" RustAcademy...") baked in —
// likely unintentional, but changing it would invalidate/duplicate any
// already-persisted data for existing users, so it's left as-is here.
const SYNC_SETTINGS_KEY = " RustAcademy.background-sync.settings.v1";
const SYNC_SNAPSHOT_KEY = " RustAcademy.background-sync.snapshot.v1";
const SYNC_TASK_NAME = " RustAcademy.background-sync.task";
// Caps on how much history is retained locally, to keep storage and
// merge/sort work bounded.
const MAX_NOTIFICATIONS = 50;
const MAX_ACTIVITY_ITEMS = 25;

// Background-task scheduling interval (in minutes) for each frequency tier.
export const SYNC_INTERVALS_MINUTES: Record<SyncFrequency, number> = {
  "battery-saver": 60,
  balanced: 30,
  frequent: 15,
};

export const DEFAULT_BACKGROUND_SYNC_SETTINGS: BackgroundSyncSettings = {
  enabled: true,
  badgeEnabled: true,
  wifiOnly: false,
  frequency: "balanced",
};

export const DEFAULT_SYNC_SNAPSHOT: SyncSnapshot = {
  currentAccountId: null,
  notifications: [],
  recentActivity: [],
  lastSyncedAt: null,
  lastSuccessfulSyncAt: null,
  initialSyncCompleted: false,
};

// Tracks whether the background task has already been defined via
// TaskManager in this process, since defineTask should only run once.
let backgroundTaskDefined = false;

// Requires a module by name, swallowing the error if it isn't installed/
// available (e.g. optional native modules like expo-background-task that
// may not be present in every build, such as Expo Go or web).
function safeRequire(moduleName: string): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require(moduleName);
  } catch {
    return null;
  }
}

function getBackgroundTaskModule() {
  return safeRequire("expo-background-task");
}

function getTaskManagerModule() {
  return safeRequire("expo-task-manager");
}

function getNotificationsModule() {
  return safeRequire("expo-notifications");
}

// Derives a stable notification id for a transaction: prefers the
// transaction hash, falling back to the paging token if unavailable.
function notificationIdForTransaction(item: TransactionItem) {
  return item.txHash || item.pagingToken;
}

// Converts a raw transaction into a PaymentNotification, determining
// direction (incoming/outgoing) and counterparty relative to the
// current account, and marking read/unread per the `read` argument.
function toNotification(
  item: TransactionItem,
  accountId: string,
  read: boolean,
): PaymentNotification {
  const isIncoming = item.destination === accountId;
  const counterparty = isIncoming ? item.source : item.destination;

  return {
    id: notificationIdForTransaction(item),
    amount: item.amount,
    asset: item.asset,
    sender: counterparty,
    receivedAt: Date.parse(item.timestamp),
    read,
    direction: isIncoming ? "incoming" : "outgoing",
    memo: item.memo,
    txHash: item.txHash,
    pagingToken: item.pagingToken,
  };
}

// Sorts notifications newest-first and truncates to MAX_NOTIFICATIONS.
function sortNotifications(items: PaymentNotification[]) {
  return [...items]
    .sort((left, right) => right.receivedAt - left.receivedAt)
    .slice(0, MAX_NOTIFICATIONS);
}

// Sorts activity items newest-first and truncates to MAX_ACTIVITY_ITEMS.
function sortActivity(items: TransactionItem[]) {
  return [...items]
    .sort(
      (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
    )
    .slice(0, MAX_ACTIVITY_ITEMS);
}

// Merges freshly fetched transactions into the existing snapshot:
//  - Updates/adds activity entries (keyed by paging token, so re-fetched
//    items overwrite their older copies rather than duplicating).
//  - Adds a notification for any transaction that doesn't already have
//    one (keyed by notificationIdForTransaction), so existing
//    notifications' read state is preserved rather than being reset.
//  - On the very first sync (initialSyncCompleted is false), new
//    notifications are seeded as already-read, so the user isn't
//    suddenly shown a wall of unread history from before they installed
//    the app; only notifications from *subsequent* syncs start unread.
export function mergeSyncSnapshot(
  previous: SyncSnapshot,
  latestItems: TransactionItem[],
  accountId: string,
): SyncSnapshot {
  const notificationMap = new Map(
    previous.notifications.map((item) => [item.id, item]),
  );
  const activityMap = new Map(
    previous.recentActivity.map((item) => [item.pagingToken, item]),
  );
  const baselineRead = !previous.initialSyncCompleted;

  for (const item of latestItems) {
    activityMap.set(item.pagingToken, item);

    const notificationId = notificationIdForTransaction(item);
    if (!notificationMap.has(notificationId)) {
      notificationMap.set(
        notificationId,
        toNotification(item, accountId, baselineRead),
      );
    }
  }

  const now = Date.now();

  return {
    currentAccountId: accountId,
    notifications: sortNotifications(Array.from(notificationMap.values())),
    recentActivity: sortActivity(Array.from(activityMap.values())),
    lastSyncedAt: now,
    lastSuccessfulSyncAt: now,
    initialSyncCompleted: true,
  };
}

// Loads persisted sync settings, validating each field's type/shape and
// falling back to defaults for anything missing or malformed (including
// if the stored JSON itself is corrupt/unparsable).
export async function getBackgroundSyncSettings(): Promise<BackgroundSyncSettings> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_SETTINGS_KEY);
    if (!raw) return DEFAULT_BACKGROUND_SYNC_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<BackgroundSyncSettings>;
    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_BACKGROUND_SYNC_SETTINGS.enabled,
      badgeEnabled:
        typeof parsed.badgeEnabled === "boolean"
          ? parsed.badgeEnabled
          : DEFAULT_BACKGROUND_SYNC_SETTINGS.badgeEnabled,
      wifiOnly:
        typeof parsed.wifiOnly === "boolean"
          ? parsed.wifiOnly
          : DEFAULT_BACKGROUND_SYNC_SETTINGS.wifiOnly,
      frequency:
        parsed.frequency && parsed.frequency in SYNC_INTERVALS_MINUTES
          ? parsed.frequency
          : DEFAULT_BACKGROUND_SYNC_SETTINGS.frequency,
    };
  } catch {
    return DEFAULT_BACKGROUND_SYNC_SETTINGS;
  }
}

export async function saveBackgroundSyncSettings(
  settings: BackgroundSyncSettings,
): Promise<void> {
  await AsyncStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
}

// Loads the persisted sync snapshot, validating each field similarly to
// getBackgroundSyncSettings and falling back to DEFAULT_SYNC_SNAPSHOT
// (or per-field defaults) if anything is missing/malformed.
export async function getSyncSnapshot(): Promise<SyncSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_SNAPSHOT_KEY);
    if (!raw) return DEFAULT_SYNC_SNAPSHOT;

    const parsed = JSON.parse(raw) as Partial<SyncSnapshot>;
    return {
      currentAccountId: parsed.currentAccountId ?? null,
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications
        : [],
      recentActivity: Array.isArray(parsed.recentActivity)
        ? parsed.recentActivity
        : [],
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "number" ? parsed.lastSyncedAt : null,
      lastSuccessfulSyncAt:
        typeof parsed.lastSuccessfulSyncAt === "number"
          ? parsed.lastSuccessfulSyncAt
          : null,
      initialSyncCompleted: Boolean(parsed.initialSyncCompleted),
    };
  } catch {
    return DEFAULT_SYNC_SNAPSHOT;
  }
}

export async function saveSyncSnapshot(snapshot: SyncSnapshot): Promise<void> {
  await AsyncStorage.setItem(SYNC_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

// Read-modify-write helper: loads the current snapshot, applies `updater`
// to produce the next snapshot, persists it, and returns it — so callers
// don't have to manually load/save around every snapshot mutation.
export async function updateStoredSyncSnapshot(
  updater: (snapshot: SyncSnapshot) => SyncSnapshot,
): Promise<SyncSnapshot> {
  const current = await getSyncSnapshot();
  const next = updater(current);
  await saveSyncSnapshot(next);
  return next;
}

// Counts how many notifications in the snapshot are unread, used to
// drive the app icon badge count.
export function getUnreadNotificationCount(snapshot: SyncSnapshot) {
  return snapshot.notifications.filter((item) => !item.read).length;
}

// Sets the OS app icon badge to `count` (or clears it to 0 if badges are
// disabled). Optionally prompts for notification permissions first (only
// meant to be done from a foreground context, not silently in the
// background). Returns false if the notifications module/API isn't
// available, or if setting the badge count fails for any reason.
export async function syncAppBadgeCount(
  count: number,
  enabled: boolean,
  promptForPermissions = false,
): Promise<boolean> {
  const Notifications = getNotificationsModule();
  if (!Notifications?.setBadgeCountAsync) {
    return false;
  }

  if (promptForPermissions && Notifications.getPermissionsAsync) {
    try {
      const permissions = await Notifications.getPermissionsAsync();
      const granted =
        permissions?.granted || permissions?.ios?.allowsBadge === true;

      if (!granted && Notifications.requestPermissionsAsync) {
        await Notifications.requestPermissionsAsync({
          ios: { allowBadge: true, allowAlert: false, allowSound: false },
        });
      }
    } catch {
      // Ignore permission errors and still attempt to set the badge count.
    }
  }

  try {
    await Notifications.setBadgeCountAsync(enabled ? count : 0);
    return true;
  } catch {
    return false;
  }
}

// Converts the configured sync frequency into a millisecond interval,
// for use when scheduling/deciding foreground sync timing.
export function getForegroundSyncIntervalMs(settings: BackgroundSyncSettings) {
  return SYNC_INTERVALS_MINUTES[settings.frequency] * 60 * 1000;
}

// Decides whether a foreground sync should run right now: always syncs
// if there's no record of a prior successful sync, otherwise only syncs
// if more than 2 minutes have passed since the last successful one (to
// avoid hammering the API every time the app is foregrounded quickly in
// succession).
export function shouldSyncOnAppForeground(snapshot: SyncSnapshot) {
  if (!snapshot.lastSuccessfulSyncAt) return true;
  return Date.now() - snapshot.lastSuccessfulSyncAt > 2 * 60 * 1000;
}

// Core sync routine, used by both foreground/manual syncs and the OS
// background task. Loads settings/snapshot/wallet session in parallel,
// then bails out early (with a "skipped" result and a reason) if:
//   - this is a background sync and syncing is disabled in settings,
//   - there's no active wallet session to sync for,
//   - the device is offline, or
//   - Wi-Fi-only is enabled but the device isn't on Wi-Fi.
// Otherwise fetches recent transactions, merges them into the snapshot,
// persists it, updates the app badge count, and returns an "updated"
// result — or a "failed" result if the fetch/merge step throws.
export async function performBackgroundSync(
  reason: SyncReason,
): Promise<SyncExecutionResult> {
  const [settings, snapshot, walletSession] = await Promise.all([
    getBackgroundSyncSettings(),
    getSyncSnapshot(),
    getWalletSession(),
  ]);

  if (reason === "background" && !settings.enabled) {
    return { status: "skipped", reason, detail: "disabled", snapshot };
  }

  if (!walletSession?.publicKey) {
    return { status: "skipped", reason, detail: "no-wallet", snapshot };
  }

  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    return { status: "skipped", reason, detail: "offline", snapshot };
  }

  if (settings.wifiOnly && network.type !== "wifi") {
    return { status: "skipped", reason, detail: "wifi-required", snapshot };
  }

  try {
    const response = await fetchTransactions(walletSession.publicKey, {
      limit: MAX_ACTIVITY_ITEMS,
    });

    const nextSnapshot = mergeSyncSnapshot(
      snapshot,
      response.items,
      walletSession.publicKey,
    );

    await saveSyncSnapshot(nextSnapshot);
    // Only prompt for notification permissions when triggered from an
    // active foreground context (never during a silent background sync).
    await syncAppBadgeCount(
      getUnreadNotificationCount(nextSnapshot),
      settings.badgeEnabled,
      reason !== "background" && AppState.currentState === "active",
    );

    return {
      status: "updated",
      reason,
      snapshot: nextSnapshot,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Background sync failed.";

    return {
      status: "failed",
      reason,
      detail: "fetch-failed",
      error: message,
      snapshot,
    };
  }
}

// Registers the named background task with TaskManager exactly once per
// process. The task body simply runs performBackgroundSync("background")
// and reports success/failure back to the OS scheduler. No-ops (without
// error) if the required native modules aren't available, so this is
// safe to call in environments where background tasks aren't supported
// (e.g. Expo Go, web).
function ensureBackgroundTaskDefined() {
  if (backgroundTaskDefined) return;

  const BackgroundTask = getBackgroundTaskModule();
  const TaskManager = getTaskManagerModule();

  if (!BackgroundTask || !TaskManager?.defineTask) {
    return;
  }

  TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    const result = await performBackgroundSync("background");

    if (result.status === "failed") {
      return BackgroundTask.BackgroundTaskResult?.Failed ?? "Failed";
    }

    return BackgroundTask.BackgroundTaskResult?.Success ?? "Success";
  });

  backgroundTaskDefined = true;
}

// Applies the user's current settings to the OS background task
// scheduler: unregisters any existing registration, then re-registers
// with the appropriate interval if syncing is enabled (or leaves it
// unregistered if disabled). Returns whether background tasks are
// available on this platform/build, and whether the task ended up
// registered. Always returns { available: false, registered: false } on
// web, since background tasks aren't supported there.
export async function configureBackgroundSyncTask(
  settings: BackgroundSyncSettings,
): Promise<{ available: boolean; registered: boolean }> {
  if (Platform.OS === "web") {
    return { available: false, registered: false };
  }

  const BackgroundTask = getBackgroundTaskModule();
  const TaskManager = getTaskManagerModule();

  if (
    !BackgroundTask?.registerTaskAsync ||
    !BackgroundTask?.unregisterTaskAsync ||
    !TaskManager?.isTaskRegisteredAsync
  ) {
    return { available: false, registered: false };
  }

  ensureBackgroundTaskDefined();

  // Always start from a clean slate: unregister any existing
  // registration before deciding whether to re-register below (e.g. so
  // a changed interval actually takes effect).
  const registered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (registered) {
    await BackgroundTask.unregisterTaskAsync(SYNC_TASK_NAME).catch(() => {});
  }

  if (!settings.enabled) {
    return { available: true, registered: false };
  }

  await BackgroundTask.registerTaskAsync(SYNC_TASK_NAME, {
    minimumInterval: getForegroundSyncIntervalMs(settings) / 1000,
  }).catch(() => {});

  const nextRegistered = await TaskManager.isTaskRegisteredAsync(
    SYNC_TASK_NAME,
  ).catch(() => false);

  return { available: true, registered: nextRegistered };
}