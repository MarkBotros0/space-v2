import Constants from "expo-constants";

import { apiClient } from "./api-client";

/**
 * The URL the check-in console's QR encodes: `<public base URL>/checkin/<token>`,
 * the base being `expo.extra.publicBaseUrl`, else the API origin — never a
 * hard-coded host. v1 parity 2026-10-09 (03-sessions R68, 04-attendance R41):
 * v1 encoded `<AUTH_URL>/checkin/<token>` so a phone's own camera opens
 * check-in; the in-app scanner accepts this form too (shared attendance.ts).
 */
export function checkInUrl(token: string): string {
  const extra = Constants.expoConfig?.extra as { publicBaseUrl?: unknown } | undefined;
  const configured = typeof extra?.publicBaseUrl === "string" ? extra.publicBaseUrl : "";
  const base = (configured || apiClient.defaults?.baseURL || "").replace(/\/+$/, "");
  return `${base}/checkin/${token}`;
}
