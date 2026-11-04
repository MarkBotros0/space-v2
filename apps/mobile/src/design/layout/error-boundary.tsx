/**
 * The screen expo-router shows when a route throws while rendering. Without
 * one, a single bad render crashes the whole app in a release build. Exported
 * as `ErrorBoundary` from the root and signed-in layouts; "Try again"
 * re-renders the route that threw. The error goes to Sentry when it is
 * configured (a no-op otherwise), once per error rather than once per render.
 */
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { reportError } from "../../lib/sentry";
import { RouteError } from "./route-states";

export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error(error);
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <View className="flex-1 justify-center bg-background px-4">
      <RouteError onRetry={() => void retry()} />
    </View>
  );
}
