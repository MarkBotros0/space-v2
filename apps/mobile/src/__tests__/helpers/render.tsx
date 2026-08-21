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

export function renderWithProviders(ui: ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>,
  );
}
