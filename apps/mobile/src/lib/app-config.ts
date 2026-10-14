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
