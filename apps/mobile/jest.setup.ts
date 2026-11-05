import "react-native-gesture-handler/jestSetup";
import { configure } from "@testing-library/react-native";

// findBy*/waitFor default to 1s. Under a full parallel run the CPU-bound render
// of a data screen can take longer (same cause as testTimeout in jest.config.js),
// which made student-engagement-notes flake; the work is slow, not hung.
configure({ asyncUtilTimeout: 5000 });

// react-native-worklets (Reanimated's runtime, pulled in by sonner-native)
// throws on import under Jest since 0.7 (Expo SDK 55): it no longer falls back
// when its native module is missing. This is the library's own Jest mock.
// (Reanimated itself is handled by jest.resolver.js.)
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));

// The rich-text editor renders inside a WebView (tentap); Jest has no native
// WebView module, so any import of design/ui would fail without this stub.
jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, WebView: View };
});

// tentap ships ESM plus a bundled editor page; tests that need its bridge
// (design-data.test.tsx) mock it in detail, everything else gets this stub.
jest.mock("@10play/tentap-editor", () => {
  const bridge = new Proxy({}, { get: () => () => Promise.resolve("") });
  return {
    useEditorBridge: () => bridge,
    useBridgeState: () => ({ isReady: false }),
    RichText: () => null,
    TenTapStartKit: [],
    CoreBridge: { configureCSS: () => ({}) },
    PlaceholderBridge: { configureExtension: () => ({}) },
  };
});

// createQueryClient wires React Query's onlineManager to NetInfo, which has no
// native module under Jest; the library's own mock (always online).
jest.mock("@react-native-community/netinfo", () =>
  require("@react-native-community/netinfo/jest/netinfo-mock.js"),
);

// design/ui's ThemeToggle reads the saved theme; the library's own mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// The Sentry SDK needs its native module, which Jest lacks. The app only uses
// these calls (src/lib/sentry.ts); sentry.test.tsx asserts against them.
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: jest.fn((component: unknown) => component),
  captureException: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
}));

// expo-notifications warns, on import, that remote push left Expo Go (SDK 53). Under Jest
// that one line repeated in every suite whose tree reaches src/lib/push.ts. Only that exact
// message is dropped: the module itself is not mocked, so nothing under test changes, and a
// test that spies on console.warn still sees every other warning.
const EXPO_GO_PUSH_WARNING =
  "expo-notifications: Android Push notifications (remote notifications)";
const forwardWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith(EXPO_GO_PUSH_WARNING)) return;
  forwardWarn(...args);
};
