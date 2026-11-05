import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { BlurView } from "expo-blur";
import { Platform } from "react-native";
import type { NavItem } from "@space/shared";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PillTabBar } from "../design/layout/floating-tab-bar";
import { PillHighlight } from "../design/layout/pill-highlight";
import { resetTabBarScroll, useTabBarScroll } from "../design/layout/tab-bar-scroll";
import { setReducedMotionForTests } from "../design/motion";

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

afterEach(() => {
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

it("labels stay one line however long they are", () => {
  renderBar();
  const label = screen.getByText("Assignments");
  expect(label.props.numberOfLines).toBe(1);
});

// Sweep at font 1.3: "Assignme…", "Submissi…". A long label shrinks (down to 0.8) to fit
// its tab before it would ever ellipsize; the font scale still stops at 1.15.
it("a long label shrinks to fit its tab instead of truncating", () => {
  renderBar();
  expect(screen.getByText("Assignments").props).toMatchObject({
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.8,
    maxFontSizeMultiplier: 1.15,
  });
  expect(screen.getByText("Assignments").props.className.split(" ")).toEqual(
    expect.arrayContaining(["self-stretch", "text-center"]),
  );
});

describe("active tab on detail screens (v1: pathname.startsWith(href + '/'))", () => {
  it("keeps the list tab lit on its singular detail route", () => {
    renderBar("assignment/[id]/index");
    expect(screen.getByLabelText("Assignments").props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it("keeps a directory tab lit on its child routes", () => {
    const { activeTabRoute } = jest.requireActual("../design/layout/floating-tab-bar");
    expect(activeTabRoute("students/alumni", ["students/index", "dashboard"])).toBe(
      "students/index",
    );
    expect(activeTabRoute("seasons/[code]/roster/index", ["seasons/index"])).toBe("seasons/index");
    expect(activeTabRoute("student/[id]/index", ["students/index"])).toBe("students/index");
  });

  it("lights nothing where v1's URL sits under no tab", () => {
    const { activeTabRoute } = jest.requireActual("../design/layout/floating-tab-bar");
    expect(activeTabRoute("session/[id]/index", ["calendar", "dashboard"])).toBeNull();
    expect(activeTabRoute("notifications", ["calendar", "dashboard"])).toBeNull();
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
    expect(mockWithSpring).not.toHaveBeenCalledWith(210, expect.anything());
  });

  it("springs the highlight to the pressed tab's x, and jumps under reduced motion", () => {
    renderBar("dashboard");
    layoutTab("Home", 140);
    layoutTab("History", 210);
    fireEvent.press(screen.getByLabelText("History"));
    expect(mockWithSpring).toHaveBeenCalledWith(210, expect.anything());
    setReducedMotionForTests(true);
    mockWithSpring.mockClear();
    fireEvent.press(screen.getByLabelText("Home"));
    expect(mockWithSpring).not.toHaveBeenCalledWith(140, expect.anything());
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
    expect(screen.getByLabelText("History").props.accessibilityState).toMatchObject({ selected: false });
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

describe("frosted fill", () => {
  it("blurs the backdrop on iOS", () => {
    renderBar();
    expect(screen.UNSAFE_queryByType(BlurView)).not.toBeNull();
  });

  it("renders the fill alone on Android", () => {
    jest.replaceProperty(Platform, "OS", "android");
    renderBar();
    expect(screen.UNSAFE_queryByType(BlurView)).toBeNull();
  });

  // R30: with no blur behind it, the translucent fill let scrolled content read through
  // the labels. Android takes the near-opaque pill-solid; iOS keeps bg-pill over the blur.
  it("uses the near-opaque pill-solid fill on Android", () => {
    jest.replaceProperty(Platform, "OS", "android");
    renderBar();
    expect(screen.getByTestId("pill-fill").props.className).toContain("bg-pill-solid");
  });

  it("keeps the translucent bg-pill over the blur on iOS", () => {
    renderBar();
    const fill = screen.getByTestId("pill-fill").props.className as string;
    expect(fill.split(" ")).toContain("bg-pill");
    expect(fill).not.toContain("pill-solid");
  });
});

describe("hide on scroll", () => {
  const touches = () => screen.getByTestId("pill-root").props.pointerEvents;
  const scroll = (dir: "up" | "down", atEnd = false) =>
    act(() => useTabBarScroll().onScrollDirection(dir, atEnd));

  it("stops intercepting touches while hidden, and returns on scroll up", () => {
    renderBar();
    expect(touches()).toBe("box-none");
    scroll("down");
    expect(touches()).toBe("none");
    scroll("up");
    expect(touches()).toBe("box-none");
  });

  it("stays in the accessibility tree while hidden", () => {
    renderBar();
    scroll("down");
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
