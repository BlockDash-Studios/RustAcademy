"use client";

import { useEffect } from "react";
import { errorReporter } from "@/lib/errorReporter";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    errorReporter.captureError(error, {
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      codeOrigin: "app/global-error.tsx",
      extra: {
        digest: error.digest,
        source: "global-error-boundary",
      },
    });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased min-h-screen flex items-center justify-center p-4">
        <div className="mx-auto max-w-md text-center rounded-3xl border border-white/10 bg-neutral-950 p-8 shadow-2xl">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-2xl text-red-400">
            ⚠️
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white">Application Error</h1>
          <p className="mb-6 text-sm text-neutral-400">
            A critical application error occurred. You can retry or reload the application.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm text-white transition"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/";
                }
              }}
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 font-bold text-sm text-white transition"
            >
              Go to Home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
