import type { Href } from "expo-router";

const CHECK_IN_PATH_RE = /^\/checkin\/([0-9A-Za-z]{10})$/;

/**
 * Where /login may send the user after signing in. ONLY a check-in link
 * (`/checkin/<10-char token>`, Plan 11 Decision 7), rebuilt as a typed route —
 * never the raw string, so a crafted `returnTo` cannot redirect anywhere else.
 * Extend deliberately, one typed shape at a time.
 */
export function returnHrefFor(raw: string | string[] | undefined): Href | null {
  if (typeof raw !== "string") return null;
  const token = CHECK_IN_PATH_RE.exec(raw)?.[1];
  return token ? { pathname: "/checkin/[token]", params: { token } } : null;
}
