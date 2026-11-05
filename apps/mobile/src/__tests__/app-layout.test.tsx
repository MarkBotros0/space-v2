import { screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { navByRole } from "@space/shared";

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { captured, resetCaptured } from "./helpers/layout-mock";
import { makeScopes, makeUser } from "./helpers/session";

// Task-7 fix round, Fix 1: nothing in the suite before this file ever
// rendered `app/(app)/_layout.tsx` — role-tabs.test.tsx only exercises
// navByRole/navFor and the filesystem. Three mutations to the layout each
// left the whole suite green:
//   (a) replacing the `tab ? {...} : NOT_A_TAB` branch with an
//       unconditional visible-tab object — every route becomes a tab
//   (b) gutting routeNameForHref to `return path` (dropping the
//       "students" -> "students/index" special case)
//   (c) deleting the `status === "anonymous"` -> <Redirect> guard
// This file renders the layouts for real (`Tabs`/`Stack`/their `.Screen`s/
// `Redirect` mocked to markers, the same technique boot-gate.test.tsx uses
// for `Stack` — the real navigator needs a context this test has no interest
// in setting up) and asserts on the `name`/`options` each screen actually
// receives, so all three mutations fail here. Since Task 9 (redesign plan 01)
// the tabs are `(app)/(tabs)/_layout.tsx` (TabsLayout) and `(app)/_layout.tsx`
// (AppLayout) is the Stack the detail routes push onto; real routing through
// both is pinned by deep-links.test.tsx.
//
// Verified (see task report for how): mutation (a) fails the "visible
// tabs, in order" assertion in both the STUDENT and ADMIN tests; mutation
// (b) fails only the ADMIN test's ordered-names assertion, because
// STUDENT's tabs never include the "/students" href that exercises the
// special case — role-tabs.test.tsx's "routeNameForHref produces a name that
// exists on disk" test also catches it independently; mutation (c) fails the
// anonymous test — `getByTestId` throws because no <Redirect> marker renders.
//
// Plan 1 Task 0 (ruling X9): the route totals are DERIVED from the layouts'
// own exported lists, not pinned. A plan adding a detail route appends to
// DETAIL_ROUTE_NAMES; the "every route file is declared" test in
// app-layout-routes.test.tsx — which reads the filesystem, independently of
// the layouts — keeps the lists honest.
jest.mock("expo-router", () => require("./helpers/layout-mock").expoRouterMock());

import { ScreenErrorBoundary } from "../design/layout/error-boundary";
import { TabBarPresenceContext } from "../design/layout/shell-context";
import { PUSHED_NAV_ROUTE_NAMES } from "../lib/route-names";
import { historyThenHomeTabsRouter } from "../lib/tabs-back-router";
import { singularTabsRouter } from "../lib/tabs-stack-router";
import AppLayout, {
  DETAIL_ROUTE_NAMES,
  DETAIL_SCREEN_OPTIONS,
  ErrorBoundary as StackErrorBoundary,
  unstable_settings as stackSettings,
} from "../../app/(app)/_layout";
import TabsLayout, {
  ALL_ROUTE_NAMES,
  ErrorBoundary as TabsErrorBoundary,
  unstable_settings as tabsSettings,
} from "../../app/(app)/(tabs)/_layout";

const scopes = makeScopes();

// Hardcoded independently of routeNameForHref: the expectation must not be
// computed with the same (possibly mutated) function the layout uses, or a
// mutation to routeNameForHref would break both sides identically and the
// test would keep passing.
const STUDENT_VISIBLE_NAMES = ["dashboard", "calendar", "work", "more"];
const ADMIN_VISIBLE_NAMES = ["dashboard", "calendar", "groups", "students/index", "more"];
const TOTAL_TAB_ROUTES = ALL_ROUTE_NAMES.length;

beforeEach(() => {
  useSessionStore.getState().clear();
  resetCaptured();
});

describe("shell", () => {
  it("renders the floating tab bar with the role's tabs, and no web top bar", () => {
    captured.renderChrome = true;
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    const tabs = screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel);
    expect(tabs).toEqual(navByRole.STUDENT.tabs.map((t) => t.label));
    expect(screen.queryByText("JPC Space")).toBeNull();
  });

  it("gives neither tabs nor detail screens a navigator header: Screen owns the top (R14)", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    expect(captured.tabsProps.screenOptions).toMatchObject({ headerShown: false, animation: "fade", transitionSpec: { config: { duration: 220 } } });
    renderWithProviders(<AppLayout />);
    for (const screenDecl of captured.stackScreens) {
      expect(screenDecl.options).toMatchObject({ headerShown: false });
      expect(screenDecl.options).not.toHaveProperty("header");
    }
  });

  it("tells tab screens the pill is under them and detail screens it is not (R15)", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    // The tabs sit inside the stack's `false`, so they must say `true` themselves.
    renderWithProviders(
      <TabBarPresenceContext.Provider value={false}>
        <TabsLayout />
      </TabBarPresenceContext.Provider>,
    );
    expect(captured.presence).toEqual({ stack: false, tabs: true });
  });
});

describe("TabsLayout", () => {
  it("shows exactly the STUDENT tabs, in order, hiding every other route", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);

    expect(captured.screens).toHaveLength(TOTAL_TAB_ROUTES);

    const visible = captured.screens.filter((s) => s.title !== undefined);
    const hidden = captured.screens.filter((s) => s.title === undefined);

    expect(visible.map((s) => s.name)).toEqual(STUDENT_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_TAB_ROUTES - navByRole.STUDENT.tabs.length);
  });

  it("shows a different visible set for ADMIN", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    renderWithProviders(<TabsLayout />);

    expect(captured.screens).toHaveLength(TOTAL_TAB_ROUTES);

    const visible = captured.screens.filter((s) => s.title !== undefined);
    const hidden = captured.screens.filter((s) => s.title === undefined);

    expect(visible.map((s) => s.name)).toEqual(ADMIN_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_TAB_ROUTES - navByRole.ADMIN.tabs.length);
    expect(visible.map((s) => s.name)).not.toEqual(STUDENT_VISIBLE_NAMES);
  });

  it("declares no detail route: those push on the stack above the tabs", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    renderWithProviders(<TabsLayout />);
    const tabNames = new Set(captured.screens.map((s) => s.name));
    expect(DETAIL_ROUTE_NAMES.filter((name) => tabNames.has(name))).toEqual([]);
  });

  it("anchors the tabs on Home, which every role has", () => {
    expect(tabsSettings).toEqual({ anchor: "dashboard" });
    expect(ALL_ROUTE_NAMES).toContain("dashboard");
  });

  it("goes Back through tab history, then Home (R19; walked for real in more-back.test.tsx)", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    expect(captured.tabsProps.backBehavior).toBe("history");
    expect(captured.tabsProps.UNSTABLE_router).toBe(historyThenHomeTabsRouter);
  });

  it("leaves the system-bar scrim to the stack layout, so there is one", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    expect(screen.queryByTestId("system-bar-scrim")).toBeNull();
  });
});

describe("AppLayout stack", () => {
  it("puts the tabs at the bottom of the stack, then every detail route with native push and swipe-back", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);

    expect(captured.stackScreens.map((s) => s.name)).toEqual([
      "(tabs)",
      ...DETAIL_ROUTE_NAMES,
      ...PUSHED_NAV_ROUTE_NAMES,
    ]);
    expect(captured.stackScreens[0]?.options).toEqual({ headerShown: false });
    for (const detail of captured.stackScreens.slice(1)) {
      expect(detail.options).toMatchObject({
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      });
    }
    expect(stackSettings).toEqual({ anchor: "(tabs)" });
  });

  it("pushes the nav destinations that are a tab for no role, like a detail (R19)", () => {
    // Settings, Notifications, Events, …: opened from More (or Profile), so
    // Back must return there — a screen in the Tabs would go Home instead.
    expect([...PUSHED_NAV_ROUTE_NAMES].sort()).toEqual([
      "assignments",
      "attendance",
      "events",
      "notifications",
      "quizzes",
      "season",
      "settings",
      "students/alumni",
      "students/dropped",
      "users/index",
    ]);
    useSessionStore.getState().setSession(makeUser("SUPER"), scopes);
    renderWithProviders(<AppLayout />);
    for (const name of PUSHED_NAV_ROUTE_NAMES) {
      const declared = captured.stackScreens.find((s) => s.name === name);
      expect([name, declared?.options]).toEqual([name, DETAIL_SCREEN_OPTIONS]);
    }
  });

  it("keeps a retry screen on both layouts for a screen that throws", () => {
    expect(StackErrorBoundary).toBe(ScreenErrorBoundary);
    expect(TabsErrorBoundary).toBe(ScreenErrorBoundary);
  });

  it("keeps the tabs one navigator: a push to a tab route pops back to it", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    expect(captured.stackProps.UNSTABLE_router).toBe(singularTabsRouter);
  });

  it("puts a solid scrim under the system bar beside the stack, for tabs and detail screens alike", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    const style = StyleSheet.flatten(screen.getByTestId("system-bar-scrim").props.style);
    expect(style.height).toBe(34);
    expect(style.bottom).toBe(0);
  });

  it.each([
    [["(app)", "(tabs)", "work"]],
    [["(app)", "assignments"]],
    [["(app)", "quizzes"]],
    [["(app)", "assignment", "[id]"]],
    // Task 12 moved these out of (tabs): their segments lost the group.
    [["(app)", "season"]],
    [["(app)", "attendance"]],
  ])("redirects an alumnus away from a student-only destination %j, but not a student (REG-81)", (segments) => {
    captured.segments = segments;
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ graduationYear: 2024 }));
    const { unmount } = renderWithProviders(<AppLayout />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/dashboard");
    expect(captured.stackScreens).toHaveLength(0);
    unmount();

    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("lets an alumnus reach their own destinations (REG-81)", () => {
    for (const segments of [["(app)", "(tabs)", "history"], ["(app)", "settings"], ["(app)", "notifications"]]) {
      captured.segments = segments;
      useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ graduationYear: 2024 }));
      const { unmount } = renderWithProviders(<AppLayout />);
      expect([segments, screen.queryByTestId("redirect")]).toEqual([segments, null]);
      unmount();
    }
  });

  it("renders the redirect and no screen when anonymous", () => {
    useSessionStore.setState({ status: "anonymous" });
    renderWithProviders(<AppLayout />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/login");
    expect(captured.stackScreens).toHaveLength(0);
  });
});
