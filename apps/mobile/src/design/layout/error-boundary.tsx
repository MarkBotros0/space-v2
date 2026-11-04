/**
 * The screen expo-router shows when a route throws while rendering. Without
 * one, a single bad render crashes the whole app in a release build. Exported
 * as `ErrorBoundary` from the root and signed-in layouts; "Try again"
 * re-renders the route that threw.
 */
import type { ErrorBoundaryProps } from "expo-router";
import { View } from "react-native";

import { RouteError } from "./route-states";

export function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error(error);
  return (
    <View className="flex-1 justify-center bg-background px-4">
      <RouteError onRetry={() => void retry()} />
    </View>
  );
}
