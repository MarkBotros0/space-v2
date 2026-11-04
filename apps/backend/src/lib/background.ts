import { waitUntil } from "@vercel/functions";

/**
 * Runs work after the response is sent without letting the platform drop it.
 * On Vercel a function may be frozen as soon as it responds, so un-awaited
 * work (a reset email, notification mail) is registered with `waitUntil` to
 * keep the instance alive until it settles. On a container host or in tests
 * there is no request context and `waitUntil` does nothing: the promise just
 * runs. Failures are logged, never thrown — the caller already answered.
 */
export function runInBackground(label: string, work: Promise<unknown>): void {
  const settled = work.catch((err: unknown) => {
    console.error(`[${label}] failed:`, err instanceof Error ? err.message : err);
  });
  waitUntil(settled);
}
