import { render, screen } from "@testing-library/react-native";

// Task 8 is known to touch `app/_layout.tsx`. If it rewrites the file wholesale
// instead of editing around the existing gate, the always-show-login bug
// (a signed-in user briefly flashed at /login before the boot check resolves)
// can silently return with every other test still green — nothing else in the
// suite renders RootLayout. This file exists specifically to fail in that
// case. It was verified (on an out-of-repo copy) to fail when the gate block
// is deleted from `app/_layout.tsx`.
//
// `Stack` is mocked to a simple marker component: the real one requires a
// navigator context this test has no interest in setting up, and all that
// matters here is whether *something* renders it, not what it renders.
jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  return {
    Stack: () => <Text>STACK</Text>,
  };
});

// RootLayout wraps everything in a bare `<SafeAreaProvider>` (no
// `initialMetrics`), which under the test renderer waits for an `onLayout`
// that never fires and so renders none of its children — see the note in
// `helpers/render.tsx`. The library ships its own jest mock for exactly this;
// use it here instead of duplicating it.
jest.mock("react-native-safe-area-context", () => {
  // The mock file is authored as `export default {...}`, which compiles to
  // `{ __esModule: true, default: {...} }` — unwrap it, or every named
  // import from this module (SafeAreaProvider included) comes back
  // `undefined` inside the mocked module.
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default ?? mock;
});

// `useBootSession` itself is covered exhaustively by use-session.test.tsx —
// here it's mocked to a no-op so this suite can drive `RootLayout` purely by
// setting the session store's status directly.
jest.mock("../hooks/use-session", () => ({
  useBootSession: jest.fn(),
}));

import RootLayout from "../../app/_layout";
import { useSessionStore } from "../store/session";

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});

describe("RootLayout boot gate", () => {
  it("shows LoadingState instead of the Stack while status is idle", () => {
    useSessionStore.setState({ status: "idle" });
    render(<RootLayout />);

    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("STACK")).toBeNull();
  });

  it("shows LoadingState instead of the Stack while status is restoring", () => {
    useSessionStore.setState({ status: "restoring" });
    render(<RootLayout />);

    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("STACK")).toBeNull();
  });

  it("renders the Stack once status is authenticated", () => {
    useSessionStore.setState({ status: "authenticated" });
    render(<RootLayout />);

    expect(screen.getByText("STACK")).toBeTruthy();
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("renders the Stack once status is anonymous", () => {
    useSessionStore.setState({ status: "anonymous" });
    render(<RootLayout />);

    expect(screen.getByText("STACK")).toBeTruthy();
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });
});
