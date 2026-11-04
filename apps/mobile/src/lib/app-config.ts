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
 * Hidden developer routes (the design-system showcase) are compiled in only
 * when the build sets EXPO_PUBLIC_SHOW_DEV_ROUTES=1.
 */
export function showDevRoutes(): boolean {
  return process.env.EXPO_PUBLIC_SHOW_DEV_ROUTES === "1";
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
