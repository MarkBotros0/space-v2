import "react-native-gesture-handler/jestSetup";
import { configure } from "@testing-library/react-native";

// findBy*/waitFor default to 1s. Under a full parallel run the CPU-bound render
// of a data screen can take longer (same cause as testTimeout in jest.config.js),
// which made student-engagement-notes flake; the work is slow, not hung.
configure({ asyncUtilTimeout: 5000 });

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

// design/ui's ThemeToggle reads the saved theme; the library's own mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
