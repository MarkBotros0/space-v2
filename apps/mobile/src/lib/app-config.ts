// apps/mobile/src/lib/app-config.ts
import Constants from "expo-constants";
import { Platform } from "react-native";

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
 * True in a build made with EXPO_PUBLIC_SWEEP_BUILD=1 (the UI sweep's APK):
 * it unlocks the hidden design catalogue in a release bundle.
 */
export function isSweepBuild(): boolean {
  return process.env.EXPO_PUBLIC_SWEEP_BUILD === "1";
}

/**
 * Sentry DSN for crash and error reporting (src/lib/sentry.ts), or null when
 * the build sets none — then Sentry stays completely off. Read as a literal
 * `process.env.EXPO_PUBLIC_*` so Expo inlines it at bundle time.
 */
export function sentryDsn(): string | null {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  return dsn ? dsn : null;
}

/**
 * Environment tag for Sentry events: EXPO_PUBLIC_SENTRY_ENVIRONMENT when the
 * build sets it, otherwise "development" in a dev bundle and "production" in
 * a release one.
 */
export function sentryEnvironment(): string {
  const env = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
  if (env) return env;
  return __DEV__ ? "development" : "production";
}

interface GoogleSignInIds {
  /** The Web OAuth client: Android asks Google for an ID token addressed to it. */
  webClientId: string;
  /** The iOS OAuth client; null on a build that has none. */
  iosClientId: string | null;
}

/**
 * Google sign-in client IDs (not secrets), or null when this build has none
 * for its platform: then the login screen's Google button says it is not on
 * yet. EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
 * win; otherwise app.json's `extra.googleWebClientId` / `extra.googleIosClientId`.
 * iOS also needs the plugin's `iosUrlScheme` in app.json.
 */
export function googleSignInIds(os: string = Platform.OS): GoogleSignInIds | null {
  const extra = Constants.expoConfig?.extra as { googleWebClientId?: unknown; googleIosClientId?: unknown } | undefined;
  const pick = (env: string | undefined, fallback: unknown): string | null =>
    env ? env : typeof fallback === "string" && fallback.length > 0 ? fallback : null;
  const webClientId = pick(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, extra?.googleWebClientId);
  const iosClientId = pick(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, extra?.googleIosClientId);
  if (!webClientId) return null;
  if (os === "ios" && !iosClientId) return null;
  return { webClientId, iosClientId };
}
