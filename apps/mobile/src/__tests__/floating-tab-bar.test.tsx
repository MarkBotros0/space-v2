import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Platform } from "react-native";
import { navByRole, type NavItem } from "@space/shared";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PillTabBar } from "../design/layout/floating-tab-bar";
import { PillHighlight } from "../design/layout/pill-highlight";
import { onTabReselect, resetTabBarScroll, swipeTabs, useTabBarScroll } from "../design/layout/tab-bar-scroll";
import { setReducedMotionForTests } from "../design/motion";
import { routeNameForHref } from "../lib/route-names";

const mockWithSpring = jest.fn();
const mockWithTiming = jest.fn();
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  // A Proxy keeps `default` and the ES-module flag that a spread would drop.
  return new Proxy(actual, {
    get: (target, key) =>
      key === "withSpring"
        ? (...a: unknown[]) => (mockWithSpring(...a), target.withSpring(...a))
        : key === "withTiming"
          ? (...a: unknown[]) => (mockWithTiming(...a), target.withTiming(...a))
          : target[key],
  });
});
jest.mock("expo-haptics");
let mockScreenReader = false;
jest.mock("../design/lib/screen-reader", () => ({
  useScreenReaderEnabled: () => mockScreenReader,
}));

afterEach(() => {
  mockScreenReader = false;
  setReducedMotionForTests(null);
  resetTabBarScroll();
  mockWithSpring.mockClear();
  mockWithTiming.mockClear();
  jest.restoreAllMocks();
});

const items: NavItem[] = [
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/assignments", label: "Assignments", icon: "assignments" },
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const TAB_ROUTES = ["calendar", "assignments", "dashboard", "history", "profile", "settings"];

function barTree(activeRoute: string, navigateToTab = jest.fn()) {
  // Every tab is a route in the navigator state, keyed `<name>-key`; the
  // focused one is `activeRoute` (a detail route when it is not a tab).
  const names = TAB_ROUTES.includes(activeRoute) ? TAB_ROUTES : [...TAB_ROUTES, activeRoute];
  const state = {
    index: names.indexOf(activeRoute),
    routes: names.map((name) => ({ key: `${name}-key`, name })),
  };
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 812 },
        insets: { top: 0, left: 0, right: 0, bottom: 34 },
      }}
    >
      <PillTabBar
        items={items}
        state={state}
        navigateToTab={navigateToTab}
        emitter={{} as unknown as BottomTabBarProps["emitter"]}
        descriptors={{} as unknown as BottomTabBarProps["descriptors"]}
        insets={{ top: 0, left: 0, right: 0, bottom: 34 }}
      />
    </SafeAreaProvider>
  );
}

function renderBar(activeRoute = "dashboard", navigateToTab = jest.fn()) {
  render(barTree(activeRoute, navigateToTab));
  return navigateToTab;
}

function layoutTab(label: string, x: number, width = 70) {
  fireEvent(screen.getByLabelText(label), "layout", {
    nativeEvent: { layout: { x, y: 0, width, height: 62 } },
  });
}
const highlightTarget = () => screen.UNSAFE_getByType(PillHighlight).props.target;

it("shows at most five tabs, like v1 tabItems.slice(0, 5)", () => {
  renderBar();
  expect(screen.getAllByRole("tab")).toHaveLength(5);
  expect(screen.queryByLabelText("Settings")).toBeNull();
});

it("groups the tabs in a tablist, so iOS reads 'tab, n of m' (M8)", () => {
  renderBar();
  expect(screen.getByTestId("pill-row").props.accessibilityRole).toBe("tablist");
});

it("marks the current route as selected", () => {
  renderBar("history");
  expect(screen.getByLabelText("History").props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.getByLabelText("Home").props.accessibilityState).toMatchObject({ selected: false });
});

it("navigates to the tab's route on press", () => {
  const navigateToTab = renderBar();
  fireEvent.press(screen.getByLabelText("Calendar"));
  expect(navigateToTab).toHaveBeenCalledWith("calendar-key");
});

it("names only the selected tab; every tab keeps its name for screen readers", () => {
  renderBar("assignments");
  expect(screen.getByText("Assignments")).toBeTruthy();
  for (const name of ["Calendar", "Home", "History", "Profile"]) {
    expect(screen.queryByText(name)).toBeNull();
    expect(screen.getByLabelText(name)).toBeTruthy();
  }
});

// Sweep at font 1.3: "Assignme…". The selected tab's label shrinks (down to 0.8) to fit
// before it would ever ellipsize; the font scale stops at 1.15.
it("the selected label stays one line and shrinks to fit instead of truncating", () => {
  renderBar("assignments");
  expect(screen.getByText("Assignments").props).toMatchObject({
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.8,
    maxFontSizeMultiplier: 1.15,
  });
});

// Owner 2026-11-07: the name goes under the icon, not beside it, and every tab keeps
// an equal share so selecting one never pushes the others sideways.
it("stacks the selected tab's name under its icon, in an equal-width tab", () => {
  renderBar("assignments");
  const selected = screen.getByLabelText("Assignments").props.className;
  const other = screen.getByLabelText("Calendar").props.className;
  expect(selected).not.toContain("flex-row");
  expect(selected).toContain("flex-1");
  expect(other).toContain("flex-1");
});

it("unselected tabs stay at least 44pt wide", () => {
  renderBar();
  expect(screen.getByLabelText("Calendar").props.className).toContain("min-w-[44px]");
});

describe("activeTabRoute", () => {
  // Only tab routes are ever focused in the Tabs navigator (details push on the
  // (app) stack), so the highlight follows an exact match or nothing (M3).
  it("is the focused route when it is in the bar, else null", () => {
    const { activeTabRoute } = jest.requireActual("../design/layout/floating-tab-bar");
    expect(activeTabRoute("students/index", ["students/index", "dashboard"])).toBe("students/index");
    expect(activeTabRoute("notes", ["calendar", "dashboard"])).toBeNull();
    expect(activeTabRoute(undefined, ["dashboard"])).toBeNull();
  });
});

describe("sliding highlight", () => {
  it("targets the active tab's measured layout", () => {
    renderBar("history");
    layoutTab("Calendar", 0);
    layoutTab("History", 210, 72);
    expect(highlightTarget()).toEqual({ x: 210, width: 72 });
  });

  it("follows the latest of two quick presses and navigates to it last", () => {
    const navigateToTab = renderBar("dashboard");
    layoutTab("Calendar", 0);
    layoutTab("Assignments", 70);
    layoutTab("History", 210);
    fireEvent.press(screen.getByLabelText("Assignments"));
    fireEvent.press(screen.getByLabelText("History"));
    expect(highlightTarget()).toEqual({ x: 210, width: 70 });
    expect(navigateToTab).toHaveBeenLastCalledWith("history-key");
  });

  it("places the highlight at the active tab on first measure without a spring", () => {
    renderBar("history");
    layoutTab("History", 210);
    expect(highlightTarget()).toEqual({ x: 210, width: 70 });
    expect(mockWithTiming).not.toHaveBeenCalledWith(210, expect.anything());
  });

  it("slides the highlight to the pressed tab's x with a short timing, never a spring, and jumps under reduced motion", () => {
    renderBar("dashboard");
    layoutTab("Home", 140);
    layoutTab("History", 210);
    fireEvent.press(screen.getByLabelText("History"));
    expect(mockWithTiming).toHaveBeenCalledWith(210, expect.objectContaining({ duration: 150 }));
    expect(mockWithSpring).not.toHaveBeenCalled();
    setReducedMotionForTests(true);
    mockWithTiming.mockClear();
    fireEvent.press(screen.getByLabelText("Home"));
    expect(mockWithTiming).not.toHaveBeenCalledWith(140, expect.anything());
  });

  it("keeps the latest press when the navigator reports an earlier one, then settles", () => {
    const nav = jest.fn();
    const view = render(barTree("dashboard", nav));
    layoutTab("Assignments", 70);
    layoutTab("History", 210);
    fireEvent.press(screen.getByLabelText("Assignments"));
    fireEvent.press(screen.getByLabelText("History"));
    view.rerender(barTree("assignments", nav));
    expect(highlightTarget()).toEqual({ x: 210, width: 70 });
    view.rerender(barTree("history", nav));
    expect(highlightTarget()).toEqual({ x: 210, width: 70 });
    // pressed was cleared: the highlight now follows the navigator again.
    view.rerender(barTree("assignments", nav));
    expect(highlightTarget()).toEqual({ x: 70, width: 70 });
  });
});

describe("no active tab (M1)", () => {
  it("fades the highlight out when the focused tab is not in this role's bar", () => {
    const view = render(barTree("history"));
    layoutTab("History", 210);
    expect(highlightTarget()).toEqual({ x: 210, width: 70 });
    mockWithTiming.mockClear();
    // More → My notes: a tab route for another role, not in this bar.
    view.rerender(barTree("notes"));
    expect(highlightTarget()).toBeNull();
    expect(mockWithTiming).toHaveBeenCalledWith(0, { duration: 150 });
    expect(screen.getByLabelText("History").props.accessibilityState).toMatchObject({
      selected: false,
    });
  });
});

describe("a student's four tabs", () => {
  it("draws four, and the highlight lands under the tapped tab", () => {
    const tabs = navByRole.STUDENT.tabs;
    const navigateToTab = jest.fn();
    const state = {
      index: 0,
      routes: tabs.map((t) => ({
        key: `${routeNameForHref(t.href)}-key`,
        name: routeNameForHref(t.href),
      })),
    } as unknown as BottomTabBarProps["state"];
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 34 },
        }}
      >
        <PillTabBar
          items={tabs}
          state={state}
          navigateToTab={navigateToTab}
          emitter={{} as unknown as BottomTabBarProps["emitter"]}
          descriptors={{} as unknown as BottomTabBarProps["descriptors"]}
          insets={{ top: 0, left: 0, right: 0, bottom: 34 }}
        />
      </SafeAreaProvider>,
    );
    expect(screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel)).toEqual([
      "Home",
      "Calendar",
      "My work",
      "More",
    ]);
    ["Home", "Calendar", "My work", "More"].forEach((label, i) => layoutTab(label, i * 85, 85));

    fireEvent.press(screen.getByLabelText("My work"));
    expect(highlightTarget()).toEqual({ x: 170, width: 85 });
    expect(navigateToTab).toHaveBeenCalledWith("work-key");

    fireEvent.press(screen.getByLabelText("More"));
    expect(highlightTarget()).toEqual({ x: 255, width: 85 });
  });
});

describe("navigation the pill did not start", () => {
  it("follows the navigator to a route nobody pressed", () => {
    const nav = jest.fn();
    const view = render(barTree("dashboard", nav));
    layoutTab("Assignments", 70);
    layoutTab("History", 210);
    fireEvent.press(screen.getByLabelText("Assignments"));
    view.rerender(barTree("history", nav));
    expect(highlightTarget()).toEqual({ x: 210, width: 70 });
  });
});

describe("fill (owner R38, reaffirmed 2026-11-08)", () => {
  it.each(["ios", "android"] as const)("is one opaque bg-pill on %s, with no blur", (os) => {
    jest.replaceProperty(Platform, "OS", os);
    renderBar();
    const fill = screen.getByTestId("pill-fill").props.className as string;
    expect(fill.split(" ")).toContain("bg-pill");
    expect(fill).not.toMatch(/bg-pill\//);
    expect(screen.queryByTestId("pill-blur")).toBeNull();
  });
});

describe("pressing the open tab (owner, 2026-11-08)", () => {
  it("asks its screen to go to the top instead of navigating", () => {
    const nav = jest.fn();
    render(barTree("dashboard", nav));
    const heard = jest.fn();
    const off = onTabReselect(heard);
    fireEvent.press(screen.getByLabelText("Home"));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
    off();
  });
});

describe("hide on scroll", () => {
  const touches = () => screen.getByTestId("pill-root", { includeHiddenElements: true }).props.pointerEvents;
  const scroll = (dir: "up" | "down", atEnd = false) => act(() => useTabBarScroll().onScrollDirection(dir, atEnd));

  it("stops intercepting touches while hidden, and returns on scroll up", () => {
    renderBar();
    expect(touches()).toBe("box-none");
    scroll("down");
    expect(touches()).toBe("none");
    scroll("up");
    expect(touches()).toBe("box-none");
  });

  it("leaves the accessibility tree while hidden (M7)", () => {
    renderBar();
    scroll("down");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    scroll("up");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("stays shown while a screen reader is on (M7)", () => {
    mockScreenReader = true;
    renderBar();
    scroll("down");
    expect(touches()).toBe("box-none");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("shows again at the end of the content", () => {
    renderBar();
    scroll("down");
    scroll("down", true);
    expect(touches()).toBe("box-none");
  });

  it("is visible again after a tab change, however it was left", () => {
    const view = render(barTree("dashboard"));
    scroll("down");
    expect(touches()).toBe("none");
    view.rerender(barTree("history"));
    expect(touches()).toBe("box-none");
  });
});

describe("swiping between tabs (owner, 2026-11-08)", () => {
  it("a swipe left opens the next tab in the pill's order, a swipe right the previous", () => {
    const nav = jest.fn();
    const view = render(barTree("dashboard", nav));
    act(() => swipeTabs(1));
    expect(nav).toHaveBeenLastCalledWith("history-key");
    // History is now the open tab, so a swipe back returns Home.
    act(() => swipeTabs(-1));
    expect(nav).toHaveBeenLastCalledWith("dashboard-key");
    view.unmount();
  });

  it("stops at the ends, and does nothing from a screen that isn't in the bar", () => {
    const nav = jest.fn();
    const first = render(barTree("calendar", nav));
    act(() => swipeTabs(-1));
    first.unmount();
    const off = render(barTree("notes", nav));
    act(() => swipeTabs(1));
    off.unmount();
    expect(nav).not.toHaveBeenCalled();
  });
});
