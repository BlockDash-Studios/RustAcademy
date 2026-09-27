import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorBoundary } from "../ErrorBoundary";
import { errorReporter } from "@/lib/errorReporter";

function ProblemChild({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Render explosion");
  }
  return <div>Healthy Child Content</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Hello Safe World</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Hello Safe World")).toBeInTheDocument();
  });

  it("catches rendering errors and shows fallback UI with error details", () => {
    const captureSpy = vi.spyOn(errorReporter, "captureError");

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Render explosion/)).toBeInTheDocument();

    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Render explosion" }),
      expect.objectContaining({
        codeOrigin: "ErrorBoundary",
      })
    );
  });

  it("calls onError callback when provided", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Render explosion" }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it("supports custom ReactNode fallback", () => {
    render(
      <ErrorBoundary fallback={<div>Custom Static Fallback</div>}>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Static Fallback")).toBeInTheDocument();
  });

  it("supports custom render function fallback with retry", () => {
    render(
      <ErrorBoundary
        fallback={(err, retry) => (
          <div>
            <p>Custom: {err.message}</p>
            <button type="button" onClick={retry}>
              Custom Retry
            </button>
          </div>
        )}
      >
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom: Render explosion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom Retry" })).toBeInTheDocument();
  });

  it("recovers and re-renders children when retry button is clicked", () => {
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) {
        throw new Error("Temporary crash");
      }
      return <div>Now Working</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("An error occurred")).toBeInTheDocument();

    // Fix the underlying issue before retrying
    shouldThrow = false;

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    rerender(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Now Working")).toBeInTheDocument();
  });

  it("triggers onOpenReportIssue when Report Issue button is clicked", () => {
    const onOpenReportIssue = vi.fn();

    render(
      <ErrorBoundary onOpenReportIssue={onOpenReportIssue}>
        <ProblemChild />
      </ErrorBoundary>
    );

    const reportButton = screen.getByRole("button", { name: "Report Issue" });
    fireEvent.click(reportButton);

    expect(onOpenReportIssue).toHaveBeenCalledTimes(1);
    expect(onOpenReportIssue).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Render explosion" }),
      expect.any(String)
    );
  });
});
