import { screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { navByRole } from "@space/shared";

import { useSessionStore } from "../store/session";
import { renderWithProviders } from "./helpers/render";
import { listDetailRouteNames, listTabRouteNames } from "./helpers/routes";
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
// DETAIL_ROUTE_NAMES; the "every route file is declared" test below — which
// reads the filesystem, independently of the layouts — keeps both lists honest.
type CapturedScreen = {
  name: string;
  title?: string;
  href?: string | null;
  hidden?: unknown;
  options?: Record<string, unknown>;
};
let mockScreens: CapturedScreen[] = [];
let mockStackScreens: CapturedScreen[] = [];
let mockSegments: string[] = ["(app)", "(tabs)", "dashboard"];
// When set, the Tabs mock also renders the layout's tabBar (the pill), which
// needs providers the routing tests do without.
let mockRenderChrome = false;
let mockTabsProps: Record<string, unknown> = {};
let mockStackProps: Record<string, unknown> = {};
// What each navigator sees of TabBarPresenceContext (ruling R15).
let mockPresence: { tabs?: boolean; stack?: boolean } = {};

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  const { useContext } = require("react");
  const usePresence = () => useContext(require("../design/layout/shell-context").TabBarPresenceContext);
  const capture = (into: () => CapturedScreen[]) =>
    function Screen({ name, options }: { name: string; options?: Record<string, unknown> }) {
      into().push({
        name,
        title: options?.title as string | undefined,
        href: options && "href" in options ? (options.href as string | null) : undefined,
        hidden: options && "hidden" in options ? options.hidden : undefined,
        options,
      });
      return null;
    };
  const Tabs = ({
    children,
    tabBar,
    ...rest
  }: {
    children: React.ReactNode;
    tabBar?: (props: unknown) => React.ReactNode;
  }) => (
    (mockTabsProps = rest),
    (mockPresence.tabs = usePresence()),
    <>
      {children}
      {mockRenderChrome && tabBar
        ? tabBar({
            state: { index: 0, routes: [{ key: "dashboard", name: "dashboard" }] },
            navigation: { navigate: () => {} },
            descriptors: {},
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
          })
        : null}
    </>
  );
  Tabs.Screen = capture(() => mockScreens);
  const Stack = ({ children, ...rest }: { children: React.ReactNode }) => (
    (mockStackProps = rest),
    (mockPresence.stack = usePresence()),
    <>{children}</>
  );
  Stack.Screen = capture(() => mockStackScreens);
  return {
    Tabs,
    Stack,
    useSegments: () => mockSegments,
    useRouter: () => ({ push: () => {} }),
    useFocusEffect: () => {},
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});

import { ScreenErrorBoundary } from "../design/layout/error-boundary";
import { TabBarPresenceContext } from "../design/layout/shell-context";
import { singularTabsRouter } from "../lib/tabs-stack-router";
import AppLayout, {
  DETAIL_ROUTE_NAMES,
  ErrorBoundary as StackErrorBoundary,
  unstable_settings as stackSettings,
} from "../../app/(app)/_layout";
import TabsLayout, {
  ALL_ROUTE_NAMES,
  ErrorBoundary as TabsErrorBoundary,
  routeNameForHref,
  unstable_settings as tabsSettings,
} from "../../app/(app)/(tabs)/_layout";

const scopes = makeScopes();

// Hardcoded independently of routeNameForHref: the expectation must not be
// computed with the same (possibly mutated) function the layout uses, or a
// mutation to routeNameForHref would break both sides identically and the
// test would keep passing.
const STUDENT_VISIBLE_NAMES = ["calendar", "assignments", "dashboard", "quizzes", "more"];
const ADMIN_VISIBLE_NAMES = ["calendar", "groups", "dashboard", "students/index", "more"];
const TOTAL_TAB_ROUTES = ALL_ROUTE_NAMES.length;

beforeEach(() => {
  useSessionStore.getState().clear();
  mockScreens = [];
  mockStackScreens = [];
  mockSegments = ["(app)", "(tabs)", "dashboard"];
  mockRenderChrome = false;
  mockTabsProps = {};
  mockStackProps = {};
  mockPresence = {};
});

describe("shell", () => {
  it("renders the floating tab bar with the role's tabs, and no web top bar", () => {
    mockRenderChrome = true;
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    const tabs = screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel);
    expect(tabs).toEqual(navByRole.STUDENT.tabs.map((t) => t.label));
    expect(screen.queryByText("JPC Space")).toBeNull();
  });

  it("gives neither tabs nor detail screens a navigator header: Screen owns the top (R14)", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    expect(mockTabsProps.screenOptions).toMatchObject({ headerShown: false, animation: "fade", transitionSpec: { config: { duration: 220 } } });
    renderWithProviders(<AppLayout />);
    for (const screenDecl of mockStackScreens) {
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
    expect(mockPresence).toEqual({ stack: false, tabs: true });
  });
});

describe("TabsLayout", () => {
  it("shows exactly the STUDENT tabs, in order, hiding every other route", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);

    expect(mockScreens).toHaveLength(TOTAL_TAB_ROUTES);

    const visible = mockScreens.filter((s) => s.title !== undefined);
    const hidden = mockScreens.filter((s) => s.title === undefined);

    expect(visible.map((s) => s.name)).toEqual(STUDENT_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_TAB_ROUTES - navByRole.STUDENT.tabs.length);
  });

  it("shows a different visible set for ADMIN", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    renderWithProviders(<TabsLayout />);

    expect(mockScreens).toHaveLength(TOTAL_TAB_ROUTES);

    const visible = mockScreens.filter((s) => s.title !== undefined);
    const hidden = mockScreens.filter((s) => s.title === undefined);

    expect(visible.map((s) => s.name)).toEqual(ADMIN_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_TAB_ROUTES - navByRole.ADMIN.tabs.length);
    expect(visible.map((s) => s.name)).not.toEqual(STUDENT_VISIBLE_NAMES);
  });

  it("declares no detail route: those push on the stack above the tabs", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    renderWithProviders(<TabsLayout />);
    const tabNames = new Set(mockScreens.map((s) => s.name));
    expect(DETAIL_ROUTE_NAMES.filter((name) => tabNames.has(name))).toEqual([]);
  });

  it("anchors the tabs on Home, which every role has", () => {
    expect(tabsSettings).toEqual({ anchor: "dashboard" });
    expect(ALL_ROUTE_NAMES).toContain("dashboard");
  });

  it("goes Back to its anchor (expo-router 58 ignores a non-stack anchor otherwise)", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    expect(mockTabsProps.backBehavior).toBe("initialRoute");
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

    expect(mockStackScreens.map((s) => s.name)).toEqual(["(tabs)", ...DETAIL_ROUTE_NAMES]);
    expect(mockStackScreens[0]?.options).toEqual({ headerShown: false });
    for (const detail of mockStackScreens.slice(1)) {
      expect(detail.options).toMatchObject({
        animation: "slide_from_right",
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      });
    }
    expect(stackSettings).toEqual({ anchor: "(tabs)" });
  });

  it("keeps a retry screen on both layouts for a screen that throws", () => {
    expect(StackErrorBoundary).toBe(ScreenErrorBoundary);
    expect(TabsErrorBoundary).toBe(ScreenErrorBoundary);
  });

  it("keeps the tabs one navigator: a push to a tab route pops back to it", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    expect(mockStackProps.UNSTABLE_router).toBe(singularTabsRouter);
  });

  it("puts a solid scrim under the system bar beside the stack, for tabs and detail screens alike", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    const style = StyleSheet.flatten(screen.getByTestId("system-bar-scrim").props.style);
    expect(style.height).toBe(34);
    expect(style.bottom).toBe(0);
  });

  it.each([
    [["(app)", "(tabs)", "assignments"]],
    [["(app)", "assignment", "[id]"]],
  ])("redirects an alumnus away from a student-only destination %j, but not a student (REG-81)", (segments) => {
    mockSegments = segments;
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ graduationYear: 2024 }));
    const { unmount } = renderWithProviders(<AppLayout />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/dashboard");
    expect(mockStackScreens).toHaveLength(0);
    unmount();

    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("lets an alumnus reach their own destinations (REG-81)", () => {
    mockSegments = ["(app)", "(tabs)", "history"];
    useSessionStore.getState().setSession(makeUser("STUDENT"), makeScopes({ graduationYear: 2024 }));
    renderWithProviders(<AppLayout />);
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("renders the redirect and no screen when anonymous", () => {
    useSessionStore.setState({ status: "anonymous" });
    renderWithProviders(<AppLayout />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/login");
    expect(mockStackScreens).toHaveLength(0);
  });
});

describe("route declarations", () => {
  it("declares every route file: tabs in (tabs)/, detail routes beside it", () => {
    // `Tabs` and `Stack` auto-register every file in their directory, and one
    // a layout does not declare still renders. The left sides are read from disk,
    // not from the layouts, so a new route file without a list entry fails
    // here even though the derived totals above would not notice.
    expect(new Set(listTabRouteNames())).toEqual(new Set(ALL_ROUTE_NAMES));
    expect(new Set(listDetailRouteNames())).toEqual(new Set(DETAIL_ROUTE_NAMES));
  });

  it("declares users/import and the group importer as detail routes", () => {
    expect(DETAIL_ROUTE_NAMES).toContain("users/import");
    expect(DETAIL_ROUTE_NAMES).toContain("seasons/[code]/roster/import");
  });

  it("never declares a screen href: null or hidden — expo-router 58 redirects a focused hidden tab to the first tab", () => {
    for (const role of ["STUDENT", "ADMIN", "SUPER", "LEADER", "MENTOR"] as const) {
      mockScreens = [];
      mockStackScreens = [];
      useSessionStore.getState().setSession(makeUser(role), scopes);
      const tabs = renderWithProviders(<TabsLayout />);
      tabs.unmount();
      const stack = renderWithProviders(<AppLayout />);
      stack.unmount();
      expect(mockScreens.length).toBeGreaterThan(0);
      expect(mockStackScreens.length).toBeGreaterThan(0);
      const all = [...mockScreens, ...mockStackScreens];
      expect(all.filter((s) => s.href !== undefined || s.hidden !== undefined).map((s) => s.name)).toEqual([]);
    }
  });

  it("declares every detail route without a tab title", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);

    for (const name of DETAIL_ROUTE_NAMES) {
      const declared = mockStackScreens.find((s) => s.name === name);
      expect(declared).toBeDefined();
      expect(declared?.title).toBeUndefined();
    }
  });

  it("registers the assignment detail, edit and new routes as detail routes (X7)", () => {
    const names = ["assignment/[id]/index", "assignment/[id]/edit", "assignment/new"];
    for (const name of names) expect(DETAIL_ROUTE_NAMES).toContain(name);
    // The file form must be gone: x/[id].tsx beside x/[id]/ is the ambiguity X7 forbids.
    expect(DETAIL_ROUTE_NAMES).not.toContain("assignment/[id]");
  });

  it("registers the leader-path, session, quiz and student detail routes", () => {
    for (const name of [
      "group/[id]/index",
      "submission/[publicId]",
      "session/[id]/attendance",
      "session/[id]/index",
      "quiz/[id]/index",
      "quiz/[id]/grade",
      "quiz/[id]/edit",
      "quiz/new",
      "student/[id]/index",
      "student/[id]/edit",
      "students/new",
      "users/new",
      "event/[id]",
    ]) {
      expect(DETAIL_ROUTE_NAMES).toContain(name);
    }
  });

  it("registers Plan 6's detail routes, in the directory form where they have children (X7)", () => {
    for (const name of [
      "seasons/[code]/index",
      "seasons/[code]/edit",
      "seasons/[code]/roster/index",
      "group/new",
      "group/[id]/index",
      "group/[id]/edit",
      "session/new",
      "session/[id]/edit",
    ]) {
      expect(DETAIL_ROUTE_NAMES).toContain(name);
    }
    expect(DETAIL_ROUTE_NAMES).not.toContain("group/[id]");
  });

  it("maps directory hrefs to their index route (/seasons, /students, /users)", () => {
    expect(routeNameForHref("/seasons")).toBe("seasons/index");
    expect(routeNameForHref("/students")).toBe("students/index");
    expect(routeNameForHref("/users")).toBe("users/index");
    expect(routeNameForHref("/calendar")).toBe("calendar");
  });
});
