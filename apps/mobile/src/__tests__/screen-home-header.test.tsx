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
    expect(within(compact()).getByText("Today", { includeHiddenElements: true })).toBeTruthy();
    expect(
      within(compact()).getByLabelText("User menu", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      within(compact()).getByLabelText("Notifications (3 unread)", { includeHiddenElements: true }),
    ).toBeTruthy();
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
    expect(screen.getAllByLabelText("User menu")).toHaveLength(1);
  });

  it("once scrolled past the actions row its controls are live and reachable", async () => {
    renderWithProviders(
      <Screen home>
        <RNText>body</RNText>
      </Screen>,
    );
    layoutHeading();
    await scrollTo(30);
    expect(compact().props.pointerEvents).toBe("none");
    await scrollTo(120);
    expect(compact().props.pointerEvents).toBe("box-none");
    expect(compact().props.accessibilityElementsHidden).toBe(false);
    expect(within(compact()).getByLabelText("User menu")).toBeTruthy();
    // The compact title stays out of the tree: the content holds the page's heading.
    expect(within(compact()).queryByText("Today")).toBeNull();
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
    expect(screen.queryByLabelText("User menu", { includeHiddenElements: true })).toBeNull();
  });
});
