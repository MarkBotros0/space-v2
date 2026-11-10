import "../global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useBootSession } from "../src/hooks/use-session";
import { BootRetry } from "../src/screens/shell/boot-retry";
import { LaunchScreen } from "../src/design/brand/launch-screen";
import { GEIST_FONTS } from "../src/design/theme/fonts";
import { applyStoredThemeMode } from "../src/design/theme/theme-mode";
import { useThemeColors } from "../src/design/theme/use-theme-colors";
import { Toaster } from "../src/design/ui/toaster";
import { PushNotificationsBridge } from "../src/screens/shell/push-notifications-bridge";
import { ScreenErrorBoundary } from "../src/design/layout/error-boundary";
import { OfflineScreen } from "../src/design/layout/offline-screen";
import { clearCacheOnUserChange, createQueryClient } from "../src/lib/query-client";
import { initSentry, wrapRoot } from "../src/lib/sentry";
import { keepSplashUntilReady, useHideSplashWhen } from "../src/lib/splash";
import { useSessionStore } from "../src/store/session";

// Before anything renders. A no-op unless the build sets EXPO_PUBLIC_SENTRY_DSN.
initSentry();
// The native splash (plain app background, app.json) stays up until fonts and
// theme are in place, then the LaunchScreen writes the logo on the same colour
// while the stored session settles underneath.
keepSplashUntilReady();

const queryClient = createQueryClient();
clearCacheOnUserChange(queryClient);

export const ErrorBoundary = ScreenErrorBoundary;

function RootLayout() {
  // Geist faces and the saved theme must be in place before first paint, or
  // every screen flashes the system font / the wrong theme on cold start.
  // A font that fails to load falls back to the system font rather than
  // leaving the app blank: wait for either outcome.
  const [fontsLoaded, fontError] = useFonts(GEIST_FONTS);
  const [themeApplied, setThemeApplied] = useState(false);
  useEffect(() => {
    void applyStoredThemeMode().finally(() => setThemeApplied(true));
  }, []);
  const sessionSettled = useSessionStore((s) => s.status !== "idle" && s.status !== "restoring");
  const shellReady = (fontsLoaded || Boolean(fontError)) && themeApplied;
  // Once per cold start: the root never remounts while the process lives.
  const [launched, setLaunched] = useState(false);
  useHideSplashWhen(shellReady);
  if (!shellReady) return null;

  return (
    // sonner-native's swipe-to-dismiss needs the gesture root at the top.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        {/* SafeAreaProvider lives here, at the root: the screen frame's top
          inset, the tab bar and bottom padding all read the insets from it. */}
        <SafeAreaProvider>
          <Gate />
          {/* Over every screen while there's no connection; under the launch logo. */}
          <OfflineScreen />
          {launched ? null : <LaunchScreen ready={sessionSettled} onGone={() => setLaunched(true)} />}
          <Toaster />
          <ThemedStatusBar />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap only when Sentry is on; otherwise the layout itself.
export default wrapRoot(RootLayout);

/** Status-bar icons follow the app theme (dark icons on v1's light background). */
function ThemedStatusBar() {
  const { colorScheme } = useColorScheme();
  return <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />;
}

/**
 * BOOT GATE — do not delete or fold this back into RootLayout without
 * keeping the behavior: nothing may render the `Stack` (and therefore reach
 * `app/index.tsx`'s redirect) until the stored session has been restored or
 * ruled out. Skipping this flashes the login screen at a signed-in user on
 * every cold start, because `index.tsx` alone can't tell "haven't checked
 * yet" apart from "checked, no session".
 */
function Gate() {
  useBootSession();
  const status = useSessionStore((s) => s.status);

  if (status === "idle" || status === "restoring") {
    return <BootLoading />;
  }
  if (status === "retry") return <BootRetry />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {status === "authenticated" ? <PushNotificationsBridge /> : null}
    </>
  );
}

/** The boot gate's wait: the app background and a spinner in the primary colour. */
function BootLoading() {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      className="flex-1 items-center justify-center bg-background"
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
