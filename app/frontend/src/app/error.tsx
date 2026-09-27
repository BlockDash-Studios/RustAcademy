"use client";

import { useEffect } from "react";
import Link from "next/link";
import { errorReporter } from "@/lib/errorReporter";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    errorReporter.captureError(error, {
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      codeOrigin: "app/error.tsx",
      extra: {
        digest: error.digest,
        source: "route-error-boundary",
      },
    });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-neutral-950/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-2xl text-red-400">
          ⚠️
        </div>
        <h2 className="mb-2 text-2xl font-bold text-white">Something went wrong!</h2>
        <p className="mb-6 text-sm text-neutral-400">
          An unexpected route error occurred. We have captured the details to help resolve this.
        </p>

        {error.message && (
          <div className="mb-6 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3 text-left">
            <p className="font-mono text-xs text-neutral-400 break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm text-white transition active:scale-95"
          >
            Try again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 font-bold text-sm text-white transition text-center"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
