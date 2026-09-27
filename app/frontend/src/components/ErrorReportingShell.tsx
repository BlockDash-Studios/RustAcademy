"use client";

import { useState, useEffect } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import {
  RequestContextProvider,
  useRequestContext,
} from "@/lib/requestContext";
import { errorReporter } from "@/lib/errorReporter";
import { useOnlineStatus } from "@/lib/onlineStatus";
import { useErrorSyncOnReconnect } from "@/hooks/useErrorSyncOnReconnect";
import { queueError } from "@/lib/errorQueue";

type ErrorReportingShellProps = {
  children: React.ReactNode;
};

type ReportPayload = {
  userMessage?: string;
};

// Inner implementation, split out so it can call useRequestContext()
// (which requires being rendered under RequestContextProvider — see the
// outer ErrorReportingShell component below).
function ErrorReportingShellContent({ children }: ErrorReportingShellProps) {
  const { requestId, correlationId } = useRequestContext();
  const { isOnline } = useOnlineStatus();
  // Controls the manual "report an issue" modal.
  const [isModalOpen, setIsModalOpen] = useState(false);
  // The error currently being reported through the modal, if any.
  const [activeError, setActiveError] = useState<Error | null>(null);
  // Short summary shown in the modal (component stack, falling back to
  // the error message).
  const [activeSummary, setActiveSummary] = useState("");

  // Wrapper to submit errors with offline queueing support
  // Posts a single error payload to the configured error-reporting
  // endpoint. Throws if the endpoint isn't configured or the request
  // fails, so callers can decide how to handle that (e.g. queueing).
  const submitErrorPayload = async (errorPayload: unknown) => {
    const url = process.env.NEXT_PUBLIC_ERROR_REPORTING_URL;
    if (!url) {
      throw new Error("Error reporting URL not configured");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(errorPayload),
    });

    if (!response.ok) {
      throw new Error(`Error reporting failed: ${response.status}`);
    }
  };

  // Sync queued errors when coming back online
  // Whenever connectivity is restored, flush any errors that were queued
  // locally while offline by resubmitting them via submitErrorPayload.
  useErrorSyncOnReconnect(submitErrorPayload);

  // Wrapper for capturing and queueing errors
  // Attempts to report an error immediately via errorReporter; if that
  // fails while offline, falls back to queueing it locally for later
  // sync (via useErrorSyncOnReconnect above) instead of losing it.
  const captureErrorWithQueue = async (error: Error, context?: any) => {
    try {
      await errorReporter.captureError(error, context);
    } catch (err) {
      // If we can't report immediately, queue it
      if (!isOnline) {
        await queueError({ error, context });
      }
    }
  };

  // Registers global listeners to catch errors that fall outside React's
  // own error boundary (e.g. errors in event handlers, timers, or
  // rejected promises), so they still get reported.
  useEffect(() => {
    // Handles uncaught synchronous errors surfaced via window.onerror.
    const handleWindowError = (event: ErrorEvent) => {
      const error =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "Uncaught window error");

      const context = {
        requestId,
        correlationId,
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        codeOrigin: event.filename
          ? `${event.filename}:${event.lineno}:${event.colno}`
          : "window.onerror",
        extra: {
          source: "window.onerror",
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      };

      captureErrorWithQueue(error, context).catch((err) => {
        console.error("Failed to capture error:", err);
      });
    };

    // Handles promise rejections that were never caught with .catch()/try-catch.
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const error =
        reason instanceof Error
          ? reason
          : new Error(
              typeof reason === "string"
                ? reason
                : "Unhandled Promise Rejection"
            );

      const context = {
        requestId,
        correlationId,
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
        codeOrigin: "unhandledrejection",
        extra: {
          source: "window.unhandledrejection",
          // Reason may not be an Error (e.g. a rejected string/object),
          // so it's serialized separately for the report's extra data.
          reason:
            typeof reason === "object" && reason !== null
              ? JSON.stringify(reason)
              : String(reason),
        },
      };

      captureErrorWithQueue(error, context).catch((err) => {
        console.error("Failed to capture error:", err);
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    // Clean up listeners on unmount, or if requestId/correlationId/isOnline
    // change (since the handlers close over those values).
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [requestId, correlationId, isOnline]);

  // Opens the manual report modal for a given error, called by
  // ErrorBoundary's onOpenReportIssue when the user clicks "Report Issue".
  const openReportModal = (error: Error, componentStack?: string) => {
    setActiveError(error);
    setActiveSummary(componentStack ?? error.message);
    setIsModalOpen(true);
  };

  // Closes the report modal and clears its associated state.
  const closeReportModal = () => {
    setIsModalOpen(false);
    setActiveError(null);
    setActiveSummary("");
  };

  // Handles submission of the report modal: attaches the user's optional
  // message and current request context, then reports (or queues) the error.
  const handleModalSubmit = async ({ userMessage }: ReportPayload) => {
    if (!activeError) {
      return;
    }

    const context = {
      requestId,
      correlationId,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      componentStack: activeError.stack,
      codeOrigin: "ErrorReportingShell.ReportIssueModal",
      extra: {
        userMessage,
        source: "report-issue-modal",
      },
    };

    await captureErrorWithQueue(activeError, context);
  };

  return (
    <>
      {/* Wraps children in the error boundary; wires "Report Issue" clicks
          from the boundary's fallback UI to open this shell's modal */}
      <ErrorBoundary onOpenReportIssue={openReportModal}>
        {children}
      </ErrorBoundary>
      {/* Manual report modal, driven by activeError/activeSummary state */}
      <ReportIssueModal
        open={isModalOpen}
        onClose={closeReportModal}
        errorSummary={activeSummary}
        requestId={requestId}
        onSubmit={handleModalSubmit}
      />
    </>
  );
}

/**
 * Wraps the entire app with error reporting and request context.
 * Should be placed at the root level, before feature providers.
 * 
 * Features:
 * - Captures uncaught errors and promise rejections
 * - Tracks request IDs and correlation IDs
 * - Allows users to manually report errors
 * - Redacts PII from error payloads
 * - Queues errors while offline and retries on reconnection
 */
// Public entry point: supplies the RequestContext (request/correlation
// IDs) that ErrorReportingShellContent depends on, then renders the
// actual implementation inside it.
export function ErrorReportingShell({ children }: ErrorReportingShellProps) {
  return (
    <RequestContextProvider>
      <ErrorReportingShellContent>{children}</ErrorReportingShellContent>
    </RequestContextProvider>
  );
}