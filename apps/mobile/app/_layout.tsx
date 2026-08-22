import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useBootSession } from "../src/hooks/use-session";
import { createQueryClient } from "../src/lib/query-client";
import { useSessionStore } from "../src/store/session";
import { ThemeProvider } from "../src/theme";
import { LoadingState } from "../src/ui";

const queryClient = createQueryClient();

export default function RootLayout() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* SafeAreaProvider lives here, not in a lower-level component: it's
            the one place Screen's useSafeAreaInsets() can find a provider,
            and nothing below mounts Screen before Task 7. */}
        <SafeAreaProvider>
          <Gate />
        </SafeAreaProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
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
    return <LoadingState />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
