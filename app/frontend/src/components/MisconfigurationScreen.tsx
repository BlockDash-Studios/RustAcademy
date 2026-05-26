import type { EnvIssue } from "@/lib/env";

type MisconfigurationScreenProps = {
  /** Validation issues that triggered the screen. */
  issues: EnvIssue[];
  /** When true, render the dev hint with .env.local instructions. */
  showDevHint?: boolean;
};

/**
 * Dedicated full-page screen rendered when critical client env validation
 * fails. Shown instead of attempting to boot the app so an operator can see
 * exactly what is wrong and how to fix it.
 *
 * - Lists every failing variable with its message.
 * - Tells the operator where to set the variable.
 * - Distinguishes errors from warnings (warnings never render this screen
 *   — but if forwarded here for visibility, are styled less alarming).
 *
 * Renders with inline styles so it works even when Tailwind/CSS hasn't loaded.
 */
export function MisconfigurationScreen({
  issues,
  showDevHint = false,
}: MisconfigurationScreenProps) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <html lang="en">
      <head>
        <title>QuickEx — Misconfiguration</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0a0a0a",
          color: "#fff",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "64px 24px",
          }}
        >
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#a3a3a3",
              margin: 0,
            }}
          >
            QuickEx is misconfigured
          </p>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              margin: "12px 0 24px",
            }}
          >
            The app can&rsquo;t start because required environment variables are
            missing or invalid.
          </h1>
          <p style={{ color: "#d4d4d4", marginBottom: 32, lineHeight: 1.6 }}>
            Fix the items below, then redeploy or restart the server. No
            requests will be served until configuration is valid.
          </p>

          {errors.length > 0 && (
            <section
              aria-labelledby="errors-heading"
              style={{
                border: "1px solid #7f1d1d",
                background: "rgba(127, 29, 29, 0.15)",
                borderRadius: 16,
                padding: 24,
                marginBottom: warnings.length > 0 ? 24 : 0,
              }}
            >
              <h2
                id="errors-heading"
                style={{
                  fontSize: 14,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "#fca5a5",
                  margin: "0 0 16px",
                }}
              >
                Errors ({errors.length})
              </h2>
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gap: 16,
                }}
              >
                {errors.map((issue) => (
                  <li key={issue.name}>
                    <code
                      style={{
                        display: "inline-block",
                        background: "#1f1f1f",
                        color: "#fda4af",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      {issue.name}
                    </code>
                    <p
                      style={{
                        margin: "6px 0 0",
                        color: "#fafafa",
                        lineHeight: 1.55,
                      }}
                    >
                      {issue.message}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <section
              aria-labelledby="warnings-heading"
              style={{
                border: "1px solid #78350f",
                background: "rgba(120, 53, 15, 0.15)",
                borderRadius: 16,
                padding: 24,
              }}
            >
              <h2
                id="warnings-heading"
                style={{
                  fontSize: 14,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "#fcd34d",
                  margin: "0 0 16px",
                }}
              >
                Warnings ({warnings.length})
              </h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 16 }}>
                {warnings.map((issue) => (
                  <li key={issue.name}>
                    <code
                      style={{
                        display: "inline-block",
                        background: "#1f1f1f",
                        color: "#fde68a",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      {issue.name}
                    </code>
                    <p style={{ margin: "6px 0 0", color: "#fafafa", lineHeight: 1.55 }}>
                      {issue.message}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            style={{
              marginTop: 40,
              padding: 20,
              border: "1px solid #262626",
              borderRadius: 16,
              background: "#0f0f0f",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#e5e5e5" }}>
              How to fix
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20, color: "#d4d4d4", lineHeight: 1.6 }}>
              <li>
                Production: set the variables in your hosting provider (e.g.
                Vercel project settings) and trigger a new deployment.
              </li>
              {showDevHint && (
                <li>
                  Local dev: add the variables to{" "}
                  <code style={{ color: "#fde68a" }}>app/frontend/.env.local</code>{" "}
                  and restart <code style={{ color: "#fde68a" }}>pnpm dev</code>.
                </li>
              )}
              <li>
                Run{" "}
                <code style={{ color: "#fde68a" }}>pnpm --filter frontend validate:env</code>{" "}
                to re-check without starting the app.
              </li>
            </ul>
          </section>
        </main>
      </body>
    </html>
  );
}
