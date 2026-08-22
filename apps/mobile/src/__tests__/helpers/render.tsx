import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

// A bare `<SafeAreaProvider>` waits for an `onLayout` that never fires under
// the test renderer, so it renders none of its children — `render()` still
// returns a truthy `toJSON()`, so a loose assertion passes against an empty
// tree. Passing `initialMetrics` makes children render synchronously, which
// is the whole point of this helper: every test that renders `Screen` (or
// anything else that calls `useSafeAreaInsets()`) must go through this, not
// a bare `render()`.
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * A fresh `QueryClient` per call, `retry: false` — unlike the app's own
 * `createQueryClient()` (one retry with backoff), a test asserting an error
 * state should not sit through a real retry delay to get there. Every screen
 * that calls `useQuery`/`useMutation` needs a `QueryClientProvider` ancestor
 * the same way every screen that renders `Screen` needs a `SafeAreaProvider`
 * one — wrapping both here means one helper covers both needs instead of
 * every screen test hand-rolling its own client.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}
