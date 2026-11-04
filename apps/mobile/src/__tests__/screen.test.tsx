import { act, fireEvent, renderHook, screen, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Keyboard, ScrollView, StyleSheet, Text as RNText, TextInput } from "react-native";

import { setReducedMotionForTests } from "../design/motion";
import { compactHeaderFade } from "../design/layout/large-title";
import { Screen } from "../design/layout/screen";
import { TabBarPresenceContext, useShellBottomPadding } from "../design/layout/shell-context";
import { resetTabBarScroll, useTabBarVisible } from "../design/layout/tab-bar-scroll";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeScopes, makeUser } from "./helpers/session";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));

const mockWithTiming = jest.fn((to: number) => to);
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withTiming: (...args: [number]) => mockWithTiming(...args),
  };
});

// The real fade, recorded: Jest's Reanimated never re-runs an animated style
// after mount, so the switch is observed at the call that sets the opacity.
const mockFade = jest.fn();
jest.mock("../design/layout/large-title", () => {
  const actual = jest.requireActual("../design/layout/large-title");
  return {
    ...actual,
    compactHeaderFade: (to: 0 | 1, animate: boolean) => {
      mockFade(to, animate);
      return actual.compactHeaderFade(to, animate);
    },
  };
});

let mockOnline = true;
jest.mock("../lib/online", () => ({ useIsOnline: () => mockOnline }));

let mockNotificationItems: unknown[] = [];
jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 3 }),
  useNotifications: () => ({ data: { pages: [{ items: mockNotificationItems }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: (pages?: { items: unknown[] }[]) => pages?.flatMap((p) => p.items) ?? [],
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockNotificationItems = [];
  useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes());
});
afterEach(() => {
  setReducedMotionForTests(null);
  resetTabBarScroll();
});

const body = <RNText>body</RNText>;

/** A scroll event as the native ScrollView sends it, then a frame for what it drives to land. */
async function scrollTo(y: number, content = 2000, viewport = 600) {
  fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 390, height: content },
      layoutMeasurement: { width: 390, height: viewport },
    },
  });
  // Reactions and styles run on the next frame.
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

function layoutTitle() {
  fireEvent(screen.getByTestId("large-title"), "layout", {
    nativeEvent: { layout: { x: 0, y: 16, width: 358, height: 60 } },
  });
}

describe("Screen: title and back link", () => {
  it("renders the large title as the header, and the subtitle", () => {
    renderWithProviders(
      <Screen title="Students" subtitle="Spring 2099">
        {body}
      </Screen>,
    );
    expect(screen.getByRole("header", { name: "Students" })).toBeTruthy();
    expect(screen.getByText("Spring 2099")).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("back link goes back, with a 44pt target and a spoken destination, announced once", () => {
    renderWithProviders(
      <Screen title="Sara" back={{ label: "Students" }}>
        {body}
      </Screen>,
    );
    const link = screen.getByRole("link", { name: "Back to Students" });
    expect(link.props.className).toContain("min-h-[44px]");
    expect(screen.getByText("Students")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /^Back to/ })).toHaveLength(1);
    fireEvent.press(link);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("back link with an href pushes it instead", () => {
    renderWithProviders(
      <Screen title="Sara" back={{ label: "Students", href: "/students" }}>
        {body}
      </Screen>,
    );
    fireEvent.press(screen.getByRole("link", { name: "Back to Students" }));
    expect(mockPush).toHaveBeenCalledWith("/students");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("renders trailing actions in the title row", () => {
    renderWithProviders(
      <Screen title="Groups" trailing={<RNText>ADD</RNText>}>
        {body}
      </Screen>,
    );
    expect(screen.getByText("ADD")).toBeTruthy();
  });

  it("without a title: no header, no compact header, just the content", () => {
    renderWithProviders(<Screen>{body}</Screen>);
    expect(screen.queryByRole("header")).toBeNull();
    expect(screen.queryByTestId("compact-header", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("large-title")).toBeNull();
    expect(screen.getByText("body")).toBeTruthy();
  });
});

describe("Screen: pinned back link (ruling R16)", () => {
  it("stays reachable past the collapsed title, outside the scroll content", async () => {
    renderWithProviders(
      <Screen title="Sara" back={{ label: "Students", href: "/students" }}>
        {body}
      </Screen>,
    );
    layoutTitle();
    await scrollTo(400);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(within(scroll).queryByRole("link", { name: "Back to Students" })).toBeNull();
    expect(screen.getByTestId("back-bar").props.pointerEvents).toBe("box-none");
    fireEvent.press(screen.getByRole("link", { name: "Back to Students" }));
    expect(mockPush).toHaveBeenCalledWith("/students");
    // Only the title fades in beside the link; the bar itself never hides.
    const compact = screen.getByTestId("compact-header", { includeHiddenElements: true });
    expect(
      within(screen.getByTestId("back-bar")).getByText("Sara", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(compact.props.pointerEvents).toBe("none");
  });

  it("without a title, still pins the back link and shows no compact title", () => {
    renderWithProviders(<Screen back={{ label: "Home" }}>{body}</Screen>);
    fireEvent.press(screen.getByRole("link", { name: "Back to Home" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("compact-header", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("large-title")).toBeNull();
  });
});

describe("Screen: home (ruling R13)", () => {
  it("home renders the bell and the user menu", () => {
    renderWithProviders(<Screen home>{body}</Screen>);
    expect(screen.getByLabelText("Notifications (3 unread)")).toBeTruthy();
    expect(screen.getByLabelText("User menu")).toBeTruthy();
  });

  it("a screen that is not home has neither", () => {
    renderWithProviders(<Screen title="Calendar">{body}</Screen>);
    expect(screen.queryByLabelText(/^Notifications/)).toBeNull();
    expect(screen.queryByLabelText("User menu")).toBeNull();
  });

  it("lists v1's 10 most recent notifications in the bell (v1 listRecent(userId, 10))", () => {
    mockNotificationItems = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      title: `Note ${i + 1}`,
      body: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      target: null,
    }));
    renderWithProviders(<Screen home>{body}</Screen>);
    fireEvent.press(screen.getByLabelText("Notifications (3 unread)"));
    expect(screen.getByText("Note 10")).toBeTruthy();
    expect(screen.queryByText("Note 11")).toBeNull();
  });
});

describe("Screen: insets", () => {
  it("puts the offline banner under the top inset, above the scrolling content", () => {
    mockOnline = false;
    renderWithProviders(<Screen title="Calendar">{body}</Screen>);
    expect(screen.getByTestId("offline-banner")).toBeTruthy();
    expect(within(screen.UNSAFE_getByType(ScrollView)).queryByTestId("offline-banner")).toBeNull();
    // Helper top inset 47: the frame owns it now that there is no top bar.
    expect(StyleSheet.flatten(screen.getByTestId("screen").props.style).paddingTop).toBe(47);
  });

  it("pads the content's bottom by useShellBottomPadding (tab bar present by default)", () => {
    renderWithProviders(<Screen title="Calendar">{body}</Screen>);
    const style = StyleSheet.flatten(
      screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
    );
    expect(style.paddingBottom).toBe(114);
  });

  it("pads less on a detail screen, which has no pill (ruling R15)", () => {
    renderWithProviders(
      <TabBarPresenceContext.Provider value={false}>
        <Screen title="Sara">{body}</Screen>
      </TabBarPresenceContext.Provider>,
    );
    const style = StyleSheet.flatten(
      screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
    );
    expect(style.paddingBottom).toBe(50);
  });
});

describe("useShellBottomPadding (ruling R15)", () => {
  function padding(hasBar: boolean | null) {
    const { SafeAreaProvider } = jest.requireActual("react-native-safe-area-context");
    const metrics = {
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, left: 0, right: 0, bottom: 34 },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={metrics}>
        {hasBar === null ? (
          children
        ) : (
          <TabBarPresenceContext.Provider value={hasBar}>{children}</TabBarPresenceContext.Provider>
        )}
      </SafeAreaProvider>
    );
    return renderHook(() => useShellBottomPadding(), { wrapper }).result.current;
  }

  it("clears the pill when there is one: inset + 64 + 16", () => {
    expect(padding(true)).toBe(114);
    expect(padding(null)).toBe(114);
  });

  it("without a pill: the bottom inset (at least 16) + 16", () => {
    expect(padding(false)).toBe(50);
  });

  it("is v1's 96 outside any provider", () => {
    expect(renderHook(() => useShellBottomPadding()).result.current).toBe(96);
  });
});

describe("Screen: collapsing title", () => {
  it("fades the compact header in past the large title", async () => {
    setReducedMotionForTests(false);
    renderWithProviders(<Screen title="Students">{body}</Screen>);
    layoutTitle();
    await scrollTo(40);
    expect(mockWithTiming).not.toHaveBeenCalled();
    await scrollTo(120);
    expect(mockWithTiming).toHaveBeenCalledWith(1, { duration: 150 });
    await scrollTo(0);
    expect(mockWithTiming).toHaveBeenLastCalledWith(0, { duration: 150 });
  });

  it("switches without animation under reduced motion", async () => {
    setReducedMotionForTests(true);
    renderWithProviders(<Screen title="Students">{body}</Screen>);
    layoutTitle();
    await scrollTo(40);
    mockFade.mockClear();
    await scrollTo(120);
    expect(mockFade).toHaveBeenCalledWith(1, false);
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it("compactHeaderFade sets the opacity outright when it must not animate", () => {
    expect(compactHeaderFade(1, false)).toBe(1);
    expect(compactHeaderFade(0, false)).toBe(0);
    expect(mockWithTiming).not.toHaveBeenCalled();
    compactHeaderFade(1, true);
    expect(mockWithTiming).toHaveBeenCalledWith(1, { duration: 150 });
  });

  it("shows the title in the compact header, hidden from screen readers (the large title is the header)", () => {
    renderWithProviders(<Screen title="Students">{body}</Screen>);
    const compact = screen.getByTestId("compact-header", { includeHiddenElements: true });
    expect(compact.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(compact.props.pointerEvents).toBe("none");
    expect(within(compact).getByText("Students", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("Screen: tab bar on scroll (ruling R2)", () => {
  function Probe() {
    const visible = useTabBarVisible();
    return <RNText testID="probe">{visible ? "shown" : "hidden"}</RNText>;
  }

  it("hides the pill scrolling down, shows it scrolling up and at the end", async () => {
    renderWithProviders(
      <>
        <Screen title="Students">{body}</Screen>
        <Probe />
      </>,
    );
    await scrollTo(40);
    expect(screen.getByTestId("probe")).toHaveTextContent("hidden");
    await scrollTo(10);
    expect(screen.getByTestId("probe")).toHaveTextContent("shown");
    await scrollTo(400);
    expect(screen.getByTestId("probe")).toHaveTextContent("hidden");
    await scrollTo(1400);
    expect(screen.getByTestId("probe")).toHaveTextContent("shown");
  });

  it("ignores movement up to 24px", async () => {
    renderWithProviders(
      <>
        <Screen title="Students">{body}</Screen>
        <Probe />
      </>,
    );
    await scrollTo(20);
    expect(screen.getByTestId("probe")).toHaveTextContent("shown");
  });

  it("a detail screen (no pill) never hides it", async () => {
    renderWithProviders(
      <>
        <TabBarPresenceContext.Provider value={false}>
          <Screen title="Sara">{body}</Screen>
        </TabBarPresenceContext.Provider>
        <Probe />
      </>,
    );
    await scrollTo(400);
    expect(screen.getByTestId("probe")).toHaveTextContent("shown");
  });
});

describe("Screen: keyboard", () => {
  it("scrolls a focused field above the keyboard from the current scroll offset", async () => {
    jest.useFakeTimers();
    const listeners: Record<
      string,
      (e: { endCoordinates: { height: number; screenY: number } }) => void
    > = {};
    const spy = jest.spyOn(Keyboard, "addListener").mockImplementation(((
      event: string,
      cb: never,
    ) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    const focused = jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
        cb(0, 600, 300, 40),
    } as never);
    try {
      renderWithProviders(<Screen title="Edit">{body}</Screen>);
      fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
        nativeEvent: {
          contentOffset: { x: 0, y: 200 },
          contentSize: { width: 390, height: 2000 },
          layoutMeasurement: { width: 390, height: 600 },
        },
      });
      const show = listeners.keyboardWillShow ?? listeners.keyboardDidShow;
      act(() => show!({ endCoordinates: { height: 300, screenY: 500 } }));
      act(() => jest.advanceTimersByTime(0));
      // Field bottom 640 + the 96 gap - keyboard top 500 = 236 past the offset of 200.
      const scrollToSpy = screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;
      expect(scrollToSpy).toHaveBeenCalledWith({ y: 436, animated: false });
      const style = StyleSheet.flatten(
        screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
      );
      expect(style.paddingBottom).toBe(316);
    } finally {
      spy.mockRestore();
      focused.mockRestore();
      jest.useRealTimers();
    }
  });
});
