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
  const storedById = new Map(
    storedNotifications.map((notification) => [notification.id, notification]),
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
          return sortNotifications(INITIAL_NOTIFICATIONS);
        }
      },
    }
  );

  const unreadCount = useMemo(
    () =>
      notifications.filter((notification) => notification.readAt === null)
        .length,
    [notifications],
  );

  const value = useMemo<NotificationCenterContextValue>(
    () => ({
      notifications,
      unreadCount,
      hasHydrated,
      markAsRead: (id: string) => {
        setNotifications((currentNotifications) =>
          sortNotifications(
            currentNotifications.map((notification) =>
              notification.id === id && notification.readAt === null
                ? {
                    ...notification,
                    readAt: new Date().toISOString(),
                  }
                : notification,
            ),
          ),
        );
      },
      markAllAsRead: () => {
        setNotifications((currentNotifications) =>
          sortNotifications(
            currentNotifications.map((notification) =>
              notification.readAt === null
                ? {
                    ...notification,
                    readAt: new Date().toISOString(),
                  }
                : notification,
            ),
          ),
        );
      },
    }),
    [notifications, unreadCount, hasHydrated, setNotifications],
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
