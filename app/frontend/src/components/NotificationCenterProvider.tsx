"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  INITIAL_NOTIFICATIONS,
  NOTIFICATION_STORAGE_KEY,
  sortNotifications,
  type StoredNotification,
} from "@/lib/notifications";

const NOTIFICATION_SYNC_TS_KEY = "RustAcademy.notification-center.syncTs";
/** Milliseconds before locally stored notifications are considered stale. */
const NOTIFICATION_STALE_THRESHOLD_MS = 5 * 60 * 1000;

export type NotificationCacheState = "fresh" | "stale" | "unavailable";

type NotificationCenterContextValue = {
  notifications: StoredNotification[];
  unreadCount: number;
  /** Freshness state of the locally cached notification list. */
  cacheState: NotificationCacheState;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  /** True once localStorage has been read on the client. Use this to suppress
   *  hydration mismatches in any component that renders unread-count badges. */
  hasHydrated: boolean;
};

const NotificationCenterContext =
  createContext<NotificationCenterContextValue | null>(null);

/**
 * Merge freshly-loaded stored notifications with the canonical INITIAL_NOTIFICATIONS
 * list, preserving the readAt state from storage.
 *
 * Guard: stored readAt values are always preferred over incoming nulls so that
 * mark-as-read actions performed while offline are never overwritten by a
 * stale server response.
 */
function mergeStoredNotifications(
  storedNotifications: StoredNotification[],
): StoredNotification[] {
  const storedById = new Map(
    storedNotifications.map((n) => [n.id, n]),
  );

  return sortNotifications(
    INITIAL_NOTIFICATIONS.map((notification) => {
      const stored = storedById.get(notification.id);
      if (!stored) return notification;
      return {
        ...notification,
        // Preserve readAt from local storage — never overwrite with null
        // from a stale server payload.
        readAt: stored.readAt ?? notification.readAt,
      };
    }),
  );
}

function getNotificationCacheState(syncedAt: string | null): NotificationCacheState {
  if (!syncedAt) return "unavailable";
  const ageMs = Date.now() - Date.parse(syncedAt);
  return ageMs <= NOTIFICATION_STALE_THRESHOLD_MS ? "fresh" : "stale";
}

export function NotificationCenterProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<StoredNotification[]>(
    sortNotifications(INITIAL_NOTIFICATIONS),
  );
  // hasHydrated starts false on both server and first client render so the
  // initial HTML matches. It is flipped to true in a useEffect (client-only),
  // after which localStorage has been read and badge counts are accurate.
  const [hasHydrated, setHasHydrated] = useState(false);
  const [cacheState, setCacheState] = useState<NotificationCacheState>("unavailable");

  // Read persisted state from localStorage — client only.
  useEffect(() => {
    const isClient = typeof window !== "undefined";
    if (!isClient) return;

    try {
      const storedValue = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      const syncedAt = window.localStorage.getItem(NOTIFICATION_SYNC_TS_KEY);

      if (storedValue) {
        const parsedValue = JSON.parse(storedValue) as StoredNotification[];
        setNotifications(mergeStoredNotifications(parsedValue));
        setCacheState(getNotificationCacheState(syncedAt));
      } else {
        // No stored data — record initial sync timestamp so first-time loads
        // are considered fresh immediately.
        const now = new Date().toISOString();
        window.localStorage.setItem(NOTIFICATION_SYNC_TS_KEY, now);
        setCacheState("fresh");
      }
    } catch (error) {
      console.error("Unable to restore notifications", error);
      setCacheState("unavailable");
    } finally {
      setHasHydrated(true);
    }
  }, []);

  // Persist to localStorage whenever notifications change after hydration.
  useEffect(() => {
    if (!hasHydrated) return;

    try {
      window.localStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(notifications),
      );
      // Update sync timestamp on every write so cache freshness is accurate.
      window.localStorage.setItem(
        NOTIFICATION_SYNC_TS_KEY,
        new Date().toISOString(),
      );
      setCacheState("fresh");
    } catch {
      // Storage full or private browsing — fail silently.
    }
  }, [hasHydrated, notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.readAt === null).length,
    [notifications],
  );

  const value = useMemo<NotificationCenterContextValue>(
    () => ({
      notifications,
      unreadCount,
      cacheState,
      hasHydrated,
      markAsRead: (id: string) => {
        setNotifications((current) =>
          sortNotifications(
            current.map((n) =>
              n.id === id && n.readAt === null
                ? { ...n, readAt: new Date().toISOString() }
                : n,
            ),
          ),
        );
      },
      markAllAsRead: () => {
        setNotifications((current) =>
          sortNotifications(
            current.map((n) =>
              n.readAt === null
                ? { ...n, readAt: new Date().toISOString() }
                : n,
            ),
          ),
        );
      },
    }),
    [notifications, unreadCount, cacheState, hasHydrated],
  );

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const context = useContext(NotificationCenterContext);

  if (!context) {
    throw new Error(
      "useNotificationCenter must be used inside NotificationCenterProvider.",
    );
  }

  return context;
}
