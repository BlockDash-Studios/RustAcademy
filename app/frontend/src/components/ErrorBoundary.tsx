"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { errorReporter } from "@/lib/errorReporter";
import { RequestContext, type RequestContextValue } from "@/lib/requestContext";

export type ErrorBoundaryProps = {
  children: ReactNode;
  // Optional callback to open an issue-reporting UI, given the captured
  // error and (if available) the component stack where it occurred.
  onOpenReportIssue?: (error: Error, componentStack?: string) => void;
  // Optional custom fallback UI shown instead of the default error screen.
  // Can be a static node, or a render function that receives the error
  // and a retry callback so the fallback can offer its own "try again".
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
  // Optional callback invoked whenever an error is caught, in addition to
  // the built-in error reporting below.
  onError?: (error: Error, info: ErrorInfo) => void;
};

export type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
};

// Class-based React error boundary (error boundaries currently must be
// class components — there's no hook equivalent). Catches render-time
// errors thrown by its children, reports them via errorReporter with
// request/correlation context, and renders either a custom fallback or a
// built-in error screen with retry/home/report actions.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  // Reads ambient request/correlation IDs from context so caught errors
  // can be tied back to the request that triggered them.
  static contextType = RequestContext;
  declare context: RequestContextValue | null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: undefined,
      componentStack: undefined,
    };
  }

  // React lifecycle hook: called during the render phase after a
  // descendant throws, used to update state so the next render shows
  // the fallback UI. Kept minimal per React's rules (no side effects
  // here) — the actual error reporting happens in componentDidCatch.
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const capturedError = error instanceof Error ? error : new Error(String(error));
    return {
      hasError: true,
      error: capturedError,
    };
  }

  // React lifecycle hook: called after a descendant throws, with the
  // error and React's componentStack info. This is where side effects
  // (state updates, external reporting, user callbacks) are safe to run.
  componentDidCatch(error: Error, info: ErrorInfo) {
    const capturedError = error instanceof Error ? error : new Error(String(error));

    this.setState({
      hasError: true,
      error: capturedError,
      componentStack: info.componentStack ?? undefined,
    });

    // Let the consumer react to the error (e.g. custom logging/analytics)
    // in addition to this component's own reporting below.
    this.props.onError?.(capturedError, info);

    // Send the error to the centralized error reporting service, enriched
    // with request/correlation IDs (from context) and the current route,
    // so it can be correlated with other logs/telemetry for this request.
    errorReporter.captureError(capturedError, {
      requestId: this.context?.requestId,
      correlationId: this.context?.correlationId,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      componentStack: info.componentStack ?? undefined,
      codeOrigin: "ErrorBoundary",
      extra: {
        source: "ErrorBoundary",
        componentStack: info.componentStack,
      },
    });
  }

  // Triggers the "Report Issue" callback with the current error/stack,
  // if one is configured and an error is actually present.
  handleReportClick = () => {
    if (!this.state.error) {
      return;
    }

    this.props.onOpenReportIssue?.(
      this.state.error,
      this.state.componentStack
    );
  };

  // Resets error state, allowing children to attempt to render again
  // ("Try again" button, and reused internally by handleGoHome).
  handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      componentStack: undefined,
    });
  };

  // Clears the error state, then navigates the user back to the home page.
  handleGoHome = () => {
    this.handleRetry();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  // Hard-reloads the current page (unused by the default UI below, but
  // available for custom fallbacks that want a full reload option).
  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided as a render function: give it the error
      // and a retry handler so it can build its own recovery UI.
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(
          this.state.error ?? new Error("An unexpected error occurred"),
          this.handleRetry
        );
      }

      // Custom fallback provided as a static node: render it as-is.
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI: a centered error card with details and
      // recovery actions, used when no custom fallback is supplied.
      return (
        <section
          role="alert"
          aria-live="assertive"
          className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-6 rounded-3xl border border-white/10 bg-neutral-950/90 p-8 text-center shadow-2xl shadow-black/20"
        >
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-2xl text-red-400">
            ⚠️
          </div>
          <p className="text-sm uppercase tracking-[0.22em] text-neutral-400">
            Something went wrong
          </p>
          <h1 className="text-3xl font-semibold text-white">An error occurred</h1>
          <p className="max-w-xl text-neutral-300">
            This issue has been captured and can be reported with your request details.
          </p>
          {/* Collapsible raw error details (message + component stack),
              only shown when an error object is actually available */}
          {this.state.error && (
            <details className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
              <summary className="cursor-pointer text-sm font-semibold text-neutral-300 hover:text-neutral-100">
                Error details
              </summary>
              <p className="mt-3 whitespace-pre-wrap break-all font-mono text-xs text-neutral-400">
                {this.state.error.message}
                {this.state.componentStack ? `\n\n${this.state.componentStack}` : ""}
              </p>
            </details>
          )}
          {/* Recovery actions: retry in place, go home, and (if configured)
              report the issue */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20 active:scale-95"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
            >
              Go to Home
            </button>
            {/* Only shown when the consumer opted in by passing onOpenReportIssue */}
            {this.props.onOpenReportIssue && (
              <button
                type="button"
                onClick={this.handleReportClick}
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-100 active:scale-95"
              >
                Report Issue
              </button>
            )}
          </div>
        </section>
      );
    }

    // No error: render children normally.
    return this.props.children;
  }
}