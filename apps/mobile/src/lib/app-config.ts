// apps/mobile/src/lib/app-config.ts
import Constants from "expo-constants";

/**
 * The EAS project id from app.json's `expo.extra.eas.projectId` (Task 10
 * Step 0), or null when this build has none. The one place push reads build
 * configuration — never process.env.
 */
export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Placeholder until the real public host is known. It names the variable to
 * fill: the check-in host is v1's AUTH_URL (the web origin its printed QR
 * codes point at). Keep in step with app.json's associatedDomains and
 * intentFilters, which carry the same placeholder host.
 */
export const PUBLIC_BASE_URL_PLACEHOLDER = "https://replace-with-auth-url-host.invalid";

/**
 * The public web origin a check-in QR points at — `expo.extra.publicBaseUrl`
 * in app.json, v1's AUTH_URL. No trailing slash.
 */
export function publicBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { publicBaseUrl?: unknown } | undefined;
  const raw = typeof extra?.publicBaseUrl === "string" && extra.publicBaseUrl.length > 0
    ? extra.publicBaseUrl
    : PUBLIC_BASE_URL_PLACEHOLDER;
  return raw.replace(/\/+$/, "");
}

/**
 * What the console QR encodes: v1's full `<AUTH_URL>/checkin/<token>`
 * (03-sessions R68, 04-attendance R41; `admin/season/[code]/sessions/[id]/page.tsx:58-60`),
 * so a phone's own camera opens check-in through the universal/app link. The
 * in-app scanner's parseCheckInCode accepts this form too.
 */
export function checkInUrlFor(token: string): string {
  return `${publicBaseUrl()}/checkin/${token}`;
}
