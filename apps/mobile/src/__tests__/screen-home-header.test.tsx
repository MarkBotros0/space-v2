import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { ScrollView, Text as RNText } from "react-native";

import { Screen } from "../design/layout/screen";
import { resetTabBarScroll } from "../design/layout/tab-bar-scroll";
import { setReducedMotionForTests } from "../design/motion";
import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { makeScopes, makeUser } from "./helpers/session";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("../lib/online", () => ({ useIsOnline: () => true }));
jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 3 }),
  useNotifications: () => ({ data: { pages: [{ items: [] }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: (pages?: { items: unknown[] }[]) => pages?.flatMap((p) => p.items) ?? [],
}));

beforeEach(() => {
  setReducedMotionForTests(true);
  useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes());
});
afterEach(() => {
  setReducedMotionForTests(null);
  resetTabBarScroll();
});

async function scrollTo(y: number) {
  fireEvent.scroll(screen.UNSAFE_getByType(ScrollView), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 390, height: 2000 },
      layoutMeasurement: { width: 390, height: 600 },
    },
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

/** Home's heading is the bell and user-menu row: collapse is past its bottom (16 + 44). */
function layoutHeading() {
  fireEvent(screen.getByTestId("large-title"), "layout", {
    nativeEvent: { layout: { x: 0, y: 16, width: 358, height: 44 } },
  });
}

const compact = () => screen.getByTestId("compact-header", { includeHiddenElements: true });

describe("Screen home: compact header (R31)", () => {
  it("titles the compact header Today and carries the bell and the user menu", () => {
    renderWithProviders(
      <Screen home>
        <RNText>body</RNText>
      </Screen>,
    );
    expect(within(compact()).getByText("Home", { includeHiddenElements: true })).toBeTruthy();
    expect(
      within(compact()).getByLabelText("Profile", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      within(compact()).getByLabelText("Notifications (3 unread)", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("compactTitle overrides the collapsed title while the large title stays", () => {
    renderWithProviders(
      <Screen home title="Hi, Sam" compactTitle="Home">
        <RNText>body</RNText>
      </Screen>,
    );
    expect(screen.getByText("Hi, Sam")).toBeTruthy();
    expect(within(compact()).getByText("Home", { includeHiddenElements: true })).toBeTruthy();
    expect(within(compact()).queryByText("Hi, Sam", { includeHiddenElements: true })).toBeNull();
  });

  it("while hidden takes no touches and is out of the accessibility tree: one user menu is found", () => {
    renderWithProviders(
      <Screen home>
        <RNText>body</RNText>
      </Screen>,
    );
    layoutHeading();
    expect(compact().props.pointerEvents).toBe("none");
    expect(compact().props.importantForAccessibility).toBe("no-hide-descendants");
    expect(compact().props.accessibilityElementsHidden).toBe(true);
    expect(screen.getAllByLabelText("Profile")).toHaveLength(1);
  });

  it("takes over as soon as the actions row starts to go under the top, not once it is gone", async () => {
    // Sweep s47-03 (alumni, small phone, 1.3): on a short page partly scrolled the row was
    // half under the status bar with no bar shown. The row's top is at 16 (the content's pt-4).
    renderWithProviders(
      <Screen home>
        <RNText>body</RNText>
      </Screen>,
    );
    layoutHeading();
    await scrollTo(10);
    expect(compact().props.pointerEvents).toBe("none");
    await scrollTo(20);
    expect(compact().props.pointerEvents).toBe("box-none");
  });

  it("takes over at the row's top with a title too: the bell and menu sit beside it", async () => {
    // Sweep s47 (alumni "Hi, <name>" + subtitle): partly scrolled, the row had gone and no bar showed.
    renderWithProviders(
      <Screen home title="Hi, Sam" subtitle="School of 2025">
        <RNText>body</RNText>
      </Screen>,
    );
    layoutHeading();
    await scrollTo(10);
    expect(compact().props.pointerEvents).toBe("none");
    await scrollTo(20);
    expect(compact().props.pointerEvents).toBe("box-none");
  });

  it("once scrolled its controls are live and reachable", async () => {
    renderWithProviders(
      <Screen home>
        <RNText>body</RNText>
      </Screen>,
    );
    layoutHeading();
    await scrollTo(120);
    expect(compact().props.pointerEvents).toBe("box-none");
    expect(compact().props.accessibilityElementsHidden).toBe(false);
    expect(within(compact()).getByLabelText("Profile")).toBeTruthy();
    // The compact title stays out of the tree: the content holds the page's heading.
    expect(within(compact()).queryByText("Home")).toBeNull();
    await scrollTo(0);
    expect(compact().props.pointerEvents).toBe("none");
  });

  it("a screen that is not home keeps a passive compact header", async () => {
    renderWithProviders(
      <Screen title="Students">
        <RNText>body</RNText>
      </Screen>,
    );
    layoutHeading();
    await scrollTo(200);
    expect(compact().props.pointerEvents).toBe("none");
    expect(screen.queryByLabelText("Profile", { includeHiddenElements: true })).toBeNull();
  });
});
