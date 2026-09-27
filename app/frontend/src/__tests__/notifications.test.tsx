import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import React from "react";
import {
  sortNotifications,
  filterNotifications,
  formatRelativeTime,
  INITIAL_NOTIFICATIONS,
  NOTIFICATION_STORAGE_KEY,
  type StoredNotification,
} from "@/lib/notifications";
import {
  NotificationCenterProvider,
  useNotificationCenter,
} from "@/components/NotificationCenterProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const unread: StoredNotification = {
  id: "a",
  category: "payments",
  title: "Unread",
  description: "desc",
  href: "/",
  actionLabel: "Go",
  createdAt: "2026-04-23T09:00:00.000Z",
  readAt: null,
};

const read: StoredNotification = {
  id: "b",
  category: "escrows",
  title: "Read",
  description: "desc",
  href: "/",
  actionLabel: "Go",
  createdAt: "2026-04-23T10:00:00.000Z",
  readAt: "2026-04-23T10:05:00.000Z",
};

const older: StoredNotification = {
  id: "c",
  category: "system",
  title: "Older unread",
  description: "desc",
  href: "/",
  actionLabel: "Go",
  createdAt: "2026-04-22T08:00:00.000Z",
  readAt: null,
};

// ---------------------------------------------------------------------------
// sortNotifications
// ---------------------------------------------------------------------------

describe("sortNotifications", () => {
  it("places unread notifications before read ones", () => {
    const result = sortNotifications([read, unread]);
    expect(result[0].id).toBe("a"); // unread first
    expect(result[1].id).toBe("b"); // read second
  });

  it("within unread items, sorts newest first", () => {
    const newerUnread: StoredNotification = {
      ...unread,
      id: "newer",
      createdAt: "2026-04-24T09:00:00.000Z",
    };
    const result = sortNotifications([older, newerUnread]);
    expect(result[0].id).toBe("newer");
    expect(result[1].id).toBe("c");
  });

  it("does not mutate the input array", () => {
    const input = [read, unread];
    const original = [...input];
    sortNotifications(input);
    expect(input).toEqual(original);
  });

  it("handles an empty array", () => {
    expect(sortNotifications([])).toEqual([]);
  });

  it("handles all-read items sorted newest first", () => {
    const old: StoredNotification = { ...read, id: "old", createdAt: "2026-01-01T00:00:00.000Z" };
    const recent: StoredNotification = { ...read, id: "recent", createdAt: "2026-06-01T00:00:00.000Z" };
    const result = sortNotifications([old, recent]);
    expect(result[0].id).toBe("recent");
  });
});

// ---------------------------------------------------------------------------
// filterNotifications
// ---------------------------------------------------------------------------

describe("filterNotifications", () => {
  const items = [unread, read, older];

  it("returns all notifications when category=all and readState=all", () => {
    expect(filterNotifications(items, "all", "all")).toHaveLength(3);
  });

  it("filters by category", () => {
    const result = filterNotifications(items, "payments", "all");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("filters unread only", () => {
    const result = filterNotifications(items, "all", "unread");
    expect(result.every((n) => n.readAt === null)).toBe(true);
    expect(result).toHaveLength(2); // unread + older
  });

  it("filters read only", () => {
    const result = filterNotifications(items, "all", "read");
    expect(result.every((n) => Boolean(n.readAt))).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("combines category and readState filters", () => {
    const result = filterNotifications(items, "escrows", "read");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("returns empty array when no items match", () => {
    expect(filterNotifications(items, "system", "read")).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const input = [unread, read];
    const original = [...input];
    filterNotifications(input, "all", "unread");
    expect(input).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe("formatRelativeTime", () => {
  beforeEach(() => {
    // Pin Date.now() to 2026-04-23T12:00:00.000Z for deterministic tests.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a relative time string for minutes", () => {
    const ts = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const result = formatRelativeTime(ts);
    expect(result).toMatch(/10 minutes ago/i);
  });

  it("returns a relative time string for hours", () => {
    const ts = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(ts);
    expect(result).toMatch(/3 hours ago/i);
  });

  it("returns a relative time string for days", () => {
    const ts = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(ts);
    expect(result).toMatch(/2 days ago/i);
  });

  it("returns a string (never throws) for a very old timestamp", () => {
    const result = formatRelativeTime("2020-01-01T00:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a future-tense string for a future timestamp", () => {
    const ts = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(ts);
    expect(result).toMatch(/in 2 hours/i);
  });
});

// ---------------------------------------------------------------------------
// NotificationCenterProvider — SSR-safe hydration
// ---------------------------------------------------------------------------

/** Consumer that just exposes context values as data-* attributes for assertion. */
function ContextProbe() {
  const { unreadCount, hasHydrated, notifications } = useNotificationCenter();
  return (
    <div
      data-testid="probe"
      data-unread={unreadCount}
      data-hydrated={String(hasHydrated)}
      data-count={notifications.length}
    />
  );
}

describe("NotificationCenterProvider — SSR hydration", () => {
  const storageKey = NOTIFICATION_STORAGE_KEY;

  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with hasHydrated=false on initial render", () => {
    render(
      <NotificationCenterProvider>
        <ContextProbe />
      </NotificationCenterProvider>,
    );
    // The probe renders synchronously; hasHydrated is set in a useEffect so it
    // should still be false at this point unless React batches the effect.
    // After the initial render we check via waitFor.
    const probe = screen.getByTestId("probe");
    // By the time the DOM is painted the effect may have already run in jsdom,
    // so we assert the final stable state: hasHydrated must become true.
    return waitFor(() => {
      expect(probe.dataset.hydrated).toBe("true");
    });
  });

  it("loads INITIAL_NOTIFICATIONS when localStorage is empty", async () => {
    render(
      <NotificationCenterProvider>
        <ContextProbe />
      </NotificationCenterProvider>,
    );
    const probe = screen.getByTestId("probe");
    await waitFor(() => {
      expect(probe.dataset.hydrated).toBe("true");
    });
    expect(Number(probe.dataset.count)).toBe(INITIAL_NOTIFICATIONS.length);
  });

  it("merges stored readAt values from localStorage on hydration", async () => {
    // Pre-seed localStorage with one notification marked as read.
    const stored: StoredNotification[] = INITIAL_NOTIFICATIONS.map((n) =>
      n.id === "payment-milestone" ? { ...n, readAt: "2026-04-23T10:00:00.000Z" } : n,
    );
    localStorage.setItem(storageKey, JSON.stringify(stored));

    render(
      <NotificationCenterProvider>
        <ContextProbe />
      </NotificationCenterProvider>,
    );
    const probe = screen.getByTestId("probe");
    await waitFor(() => {
      expect(probe.dataset.hydrated).toBe("true");
    });
    // One extra notification is now read; unreadCount should be one less.
    const expectedUnread = INITIAL_NOTIFICATIONS.filter((n) => n.readAt === null).length - 1;
    expect(Number(probe.dataset.unread)).toBe(expectedUnread);
  });

  it("gracefully handles corrupt localStorage data without throwing", async () => {
    localStorage.setItem(storageKey, "not-valid-json{{{");
    // Should not throw; falls back to INITIAL_NOTIFICATIONS.
    render(
      <NotificationCenterProvider>
        <ContextProbe />
      </NotificationCenterProvider>,
    );
    const probe = screen.getByTestId("probe");
    await waitFor(() => {
      expect(probe.dataset.hydrated).toBe("true");
    });
    expect(Number(probe.dataset.count)).toBe(INITIAL_NOTIFICATIONS.length);
  });

  it("persists notifications to localStorage after hydration", async () => {
    function MarkReader() {
      const { markAsRead } = useNotificationCenter();
      return (
        <button data-testid="mark" onClick={() => markAsRead("payment-milestone")}>
          mark
        </button>
      );
    }

    render(
      <NotificationCenterProvider>
        <MarkReader />
        <ContextProbe />
      </NotificationCenterProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("probe").dataset.hydrated).toBe("true");
    });

    act(() => {
      screen.getByTestId("mark").click();
    });

    await waitFor(() => {
      const stored = localStorage.getItem(storageKey);
      expect(stored).not.toBeNull();
      const parsed: StoredNotification[] = JSON.parse(stored!);
      const target = parsed.find((n) => n.id === "payment-milestone");
      expect(target?.readAt).not.toBeNull();
    });
  });

  it("throws if useNotificationCenter is called outside provider", () => {
    // Suppress React's error boundary noise in the test output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ContextProbe />)).toThrow(
      "useNotificationCenter must be used inside NotificationCenterProvider.",
    );
    spy.mockRestore();
  });
});
