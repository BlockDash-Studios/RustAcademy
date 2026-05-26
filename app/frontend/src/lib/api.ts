import { getClientEnv } from "@/lib/env";

/**
 * Backend origin for browser calls. Override in `.env.local`:
 * `NEXT_PUBLIC_QUICKEX_API_URL=https://api.example.com`
 */
export const getQuickexApiBase = (): string => {
  const env = getClientEnv();
  return env?.apiBaseUrl ?? "http://localhost:4000";
};
