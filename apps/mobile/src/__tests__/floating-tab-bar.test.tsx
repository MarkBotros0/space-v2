import { fireEvent, render, screen } from "@testing-library/react-native";
import type { NavItem } from "@space/shared";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { FloatingTabBar } from "../design/layout/floating-tab-bar";

const items: NavItem[] = [
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/assignments", label: "Assignments", icon: "assignments" },
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const TAB_ROUTES = ["calendar", "assignments", "dashboard", "history", "profile", "settings"];

function renderBar(activeRoute = "dashboard", navigateToTab = jest.fn()) {
  // Every tab is a route in the navigator state, keyed `<name>-key`; the
  // focused one is `activeRoute` (a detail route when it is not a tab).
  const names = TAB_ROUTES.includes(activeRoute) ? TAB_ROUTES : [...TAB_ROUTES, activeRoute];
  const state = {
    index: names.indexOf(activeRoute),
    routes: names.map((name) => ({ key: `${name}-key`, name })),
  };
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 34 } }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <FloatingTabBar items={items} state={state} navigateToTab={navigateToTab} emitter={{} as any} descriptors={{} as any} insets={{ top: 0, left: 0, right: 0, bottom: 34 }} />
    </SafeAreaProvider>,
  );
  return navigateToTab;
}

it("shows at most five tabs, like v1 tabItems.slice(0, 5)", () => {
  renderBar();
  expect(screen.getAllByRole("tab")).toHaveLength(5);
  expect(screen.queryByLabelText("Settings")).toBeNull();
});

it("marks the current route as selected", () => {
  renderBar("history");
  expect(screen.getByLabelText("History").props.accessibilityState).toMatchObject({ selected: true });
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

describe("active tab on detail screens (v1: pathname.startsWith(href + '/'))", () => {
  it("keeps the list tab lit on its singular detail route", () => {
    renderBar("assignment/[id]/index");
    expect(screen.getByLabelText("Assignments").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("keeps a directory tab lit on its child routes", () => {
    const { activeTabRoute } = jest.requireActual("../design/layout/floating-tab-bar");
    expect(activeTabRoute("students/alumni", ["students/index", "dashboard"])).toBe("students/index");
    expect(activeTabRoute("seasons/[code]/roster/index", ["seasons/index"])).toBe("seasons/index");
    expect(activeTabRoute("student/[id]/index", ["students/index"])).toBe("students/index");
  });

  it("lights nothing where v1's URL sits under no tab", () => {
    const { activeTabRoute } = jest.requireActual("../design/layout/floating-tab-bar");
    expect(activeTabRoute("session/[id]/index", ["calendar", "dashboard"])).toBeNull();
    expect(activeTabRoute("notifications", ["calendar", "dashboard"])).toBeNull();
  });
});
