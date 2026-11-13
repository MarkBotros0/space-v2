import "react-native-gesture-handler/jestSetup";
import { configure } from "@testing-library/react-native";
import { timeoutManager } from "@tanstack/react-query";

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
jest.mock("@react-native-community/netinfo", () => require("@react-native-community/netinfo/jest/netinfo-mock.js"));

// Google sign-in is a native module Jest can't load, and the package exports
// no mock. These are the calls src/lib/google-sign-in.ts makes; its own test
// replaces this with mocks it asserts on.
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ type: "cancelled", data: null }),
    signOut: jest.fn().mockResolvedValue(null),
  },
  isErrorWithCode: (e: unknown) => typeof e === "object" && e !== null && "code" in e,
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
    SIGN_IN_REQUIRED: "SIGN_IN_REQUIRED",
  },
}));

// The quiz lock's native calls (screen capture, keep awake) do nothing under Jest; the lock's own
// tests (quiz-locks, quiz-exit-flow) replace these with mocks they assert on.
jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
  addScreenshotListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));

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
const EXPO_GO_PUSH_WARNING = "expo-notifications: Android Push notifications (remote notifications)";
const forwardWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith(EXPO_GO_PUSH_WARNING)) return;
  forwardWarn(...args);
};

// React Query's timers (a query's or mutation's 5-minute gcTime, refetchInterval) must never keep
// Jest's process alive after the run: under turbo the mobile suite runs in one process, which then
// waited out every test's default gcTime. Unref'd, they still fire while the run goes on. The globals
// are looked up on each call, so jest.useFakeTimers() still drives them.
const unref = <T>(timer: T): T => {
  (timer as { unref?: () => void }).unref?.();
  return timer;
};
type TimerId = ReturnType<typeof setTimeout>;
timeoutManager.setTimeoutProvider<TimerId>({
  setTimeout: (callback, delay) => unref(setTimeout(callback, delay)),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (callback, delay) => unref(setInterval(callback, delay)),
  clearInterval: (id) => clearInterval(id),
});

// Haptics as spies, so a test can tell a quiet success (owner, 2026-11-13: no success toast where the
// screen shows the change) from nothing happening. A suite that mocks it itself keeps its own.
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));
