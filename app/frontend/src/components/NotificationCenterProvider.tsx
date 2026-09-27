"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  INITIAL_NOTIFICATIONS,
  NOTIFICATION_STORAGE_KEY,
  sortNotifications,
  type StoredNotification,
} from "@/lib/notifications";
import { usePersistentState } from "@/hooks/usePersistentState";
import { errorReporter } from "@/lib/errorReporter";

type NotificationCenterContextValue = {
  notifications: StoredNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  /** True once localStorage has been read on the client. Use this to suppress
   *  hydration mismatches in any component that renders unread-count badges. */
  hasHydrated: boolean;
};

const NotificationCenterContext =
  createContext<NotificationCenterContextValue | null>(null);

function mergeStoredNotifications(
  storedNotifications: StoredNotification[],
): StoredNotification[] {
  if (!Array.isArray(storedNotifications)) {
    return sortNotifications(INITIAL_NOTIFICATIONS);
  }

  const validStored = storedNotifications.filter(
    (item): item is StoredNotification =>
      Boolean(item && typeof item === "object" && typeof item.id === "string"),
  );

  const storedById = new Map(
    validStored.map((notification) => [notification.id, notification]),
  );

  return sortNotifications(
    INITIAL_NOTIFICATIONS.map((notification) => {
      const storedNotification = storedById.get(notification.id);

      if (!storedNotification) {
        return notification;
      }

      return {
        ...notification,
        readAt: storedNotification.readAt ?? null,
      };
    }),
  );
}

export function NotificationCenterProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId?: string;
}) {
  const [notifications, setNotifications, hasHydrated] = usePersistentState<StoredNotification[]>(
    NOTIFICATION_STORAGE_KEY,
    sortNotifications(INITIAL_NOTIFICATIONS),
    {
      userId,
      deserialize: (str: string) => {
        try {
          const parsedValue = JSON.parse(str) as StoredNotification[];
          return mergeStoredNotifications(parsedValue);
        } catch (e) {
          console.error("Unable to parse notifications", e);
          const captured = e instanceof Error ? e : new Error(String(e));
          errorReporter.captureError(captured, {
            route: typeof window !== "undefined" ? window.location.pathname : undefined,
            codeOrigin: "NotificationCenterProvider.deserialize",
            extra: {
              source: "NotificationCenterProvider",
              operation: "deserialize",
            },
          });
          return sortNotifications(INITIAL_NOTIFICATIONS);
        }
      },
    }
  );

  const safeNotifications = useMemo(
    () => (Array.isArray(notifications) ? notifications : []),
    [notifications],
  );

  const unreadCount = useMemo(
    () =>
      safeNotifications.filter(
        (notification) => notification && notification.readAt === null,
      ).length,
    [safeNotifications],
  );

  const value = useMemo<NotificationCenterContextValue>(
    () => ({
      notifications: safeNotifications,
      unreadCount,
      hasHydrated,
      markAsRead: (id: string) => {
        setNotifications((currentNotifications) => {
          const list = Array.isArray(currentNotifications)
            ? currentNotifications
            : INITIAL_NOTIFICATIONS;
          return sortNotifications(
            list.map((notification) =>
              notification && notification.id === id && notification.readAt === null
                ? {
                    ...notification,
                    readAt: new Date().toISOString(),
                  }
                : notification,
            ),
          );
        });
      },
      markAllAsRead: () => {
        setNotifications((currentNotifications) => {
          const list = Array.isArray(currentNotifications)
            ? currentNotifications
            : INITIAL_NOTIFICATIONS;
          return sortNotifications(
            list.map((notification) =>
              notification && notification.readAt === null
                ? {
                    ...notification,
                    readAt: new Date().toISOString(),
                  }
                : notification,
            ),
          );
        });
      },
    }),
    [safeNotifications, unreadCount, hasHydrated, setNotifications],
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
