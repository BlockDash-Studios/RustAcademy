import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NotificationCenterProvider,
  useNotificationCenter,
} from "@/components/NotificationCenterProvider";
import { NOTIFICATION_STORAGE_KEY } from "@/lib/notifications";
import { fetchAnalytics } from "@/hooks/analyticsApi";
import { errorReporter } from "@/lib/errorReporter";

function NotificationViewer() {
  const { notifications, unreadCount, markAllAsRead } = useNotificationCenter();
  return (
    <div>
      <p data-testid="count">{unreadCount}</p>
      <p data-testid="total">{notifications.length}</p>
      <button type="button" onClick={markAllAsRead}>
        Mark All
      </button>
    </div>
  );
}

describe("Client Error Recovery & Resilience", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("NotificationCenterProvider resilience", () => {
    it("safely recovers from invalid JSON in localStorage and reports the error", () => {
      const captureSpy = vi.spyOn(errorReporter, "captureError");
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, "invalid-json-string{{");

      render(
        <NotificationCenterProvider>
          <NotificationViewer />
        </NotificationCenterProvider>
      );

      // Should not throw, should fall back to initial notifications
      expect(screen.getByTestId("total")).toBeInTheDocument();
      expect(captureSpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          codeOrigin: "NotificationCenterProvider.deserialize",
        })
      );
    });

    it("safely recovers when stored value is not an array (e.g. string/number/object)", () => {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify({ notAnArray: true }));

      render(
        <NotificationCenterProvider>
          <NotificationViewer />
        </NotificationCenterProvider>
      );

      expect(screen.getByTestId("total")).toBeInTheDocument();
    });

    it("allows operations like markAllAsRead even after corrupt recovery", () => {
      localStorage.setItem(NOTIFICATION_STORAGE_KEY, "broken-json");

      render(
        <NotificationCenterProvider>
          <NotificationViewer />
        </NotificationCenterProvider>
      );

      const markBtn = screen.getByRole("button", { name: "Mark All" });
      expect(() => fireEvent.click(markBtn)).not.toThrow();
    });
  });

  describe("analyticsApi error capture and fallback", () => {
    it("captures analytics fetch failure and returns safe fallback data", async () => {
      const captureSpy = vi.spyOn(errorReporter, "captureError");
      global.fetch = vi.fn().mockRejectedValue(new Error("Analytics endpoint 503"));

      const data = await fetchAnalytics("24h");

      expect(data).toBeDefined();
      expect(data.volume).toEqual([]);
      expect(data.summary.totalVolume).toBe(0);
      expect(captureSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Analytics endpoint 503" }),
        expect.objectContaining({
          codeOrigin: "analyticsApi.fetchAnalytics",
        })
      );
    });
  });
});
