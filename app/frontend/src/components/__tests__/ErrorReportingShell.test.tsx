import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorReportingShell } from "../ErrorReportingShell";
import { errorReporter } from "@/lib/errorReporter";

function Bomb(): React.ReactNode {
  throw new Error("Shell explosion");
}

describe("ErrorReportingShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children wrapped with request context and error boundary", () => {
    render(
      <ErrorReportingShell>
        <div>Content Inside Shell</div>
      </ErrorReportingShell>
    );

    expect(screen.getByText("Content Inside Shell")).toBeInTheDocument();
  });

  it("catches rendering errors and opens issue reporting modal on click", async () => {
    render(
      <ErrorReportingShell>
        <Bomb />
      </ErrorReportingShell>
    );

    expect(screen.getByText("An error occurred")).toBeInTheDocument();

    const reportButton = screen.getByRole("button", { name: "Report Issue" });
    fireEvent.click(reportButton);

    // Modal should now be open
    expect(screen.getByText(/Report an issue/i)).toBeInTheDocument();
  });

  it("captures unhandled window error events", () => {
    const captureSpy = vi.spyOn(errorReporter, "captureError");

    render(
      <ErrorReportingShell>
        <div>Safe Content</div>
      </ErrorReportingShell>
    );

    const errorEvent = new ErrorEvent("error", {
      error: new Error("Async background crash"),
      message: "Async background crash",
      filename: "background.ts",
      lineno: 10,
      colno: 5,
    });

    window.dispatchEvent(errorEvent);

    expect(captureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Async background crash" }),
      expect.objectContaining({
        codeOrigin: "background.ts:10:5",
        extra: expect.objectContaining({ source: "window.onerror" }),
      })
    );
  });

  it("captures unhandled promise rejection events", () => {
    const captureSpy = vi.spyOn(errorReporter, "captureError");

    render(
      <ErrorReportingShell>
        <div>Safe Content</div>
      </ErrorReportingShell>
    );

    const rejectionEvent = new CustomEvent("unhandledrejection", {
      detail: { reason: new Error("Failed fetch in promise") },
    }) as unknown as PromiseRejectionEvent;
    Object.defineProperty(rejectionEvent, "reason", {
      value: new Error("Failed fetch in promise"),
    });

    window.dispatchEvent(rejectionEvent);

    expect(captureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed fetch in promise" }),
      expect.objectContaining({
        codeOrigin: "unhandledrejection",
        extra: expect.objectContaining({ source: "window.unhandledrejection" }),
      })
    );
  });
});
