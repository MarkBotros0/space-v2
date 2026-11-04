import { fireEvent, screen } from "@testing-library/react-native";
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
type CapturedScreen = { name: string; title?: string; href?: string | null; options?: Record<string, unknown> };
let mockScreens: CapturedScreen[] = [];
let mockStackScreens: CapturedScreen[] = [];
let mockSegments: string[] = ["(app)", "(tabs)", "dashboard"];
// When set, the Tabs mock also renders the layout's tabBar and header (the
// shell), which need providers the routing tests do without.
let mockRenderChrome = false;

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  const capture = (into: () => CapturedScreen[]) =>
    function Screen({ name, options }: { name: string; options?: Record<string, unknown> }) {
      into().push({
        name,
        title: options?.title as string | undefined,
        href: options && "href" in options ? (options.href as string | null) : undefined,
        options,
      });
      return null;
    };
  const Tabs = ({
    children,
    tabBar,
    screenOptions,
  }: {
    children: React.ReactNode;
    tabBar?: (props: unknown) => React.ReactNode;
    screenOptions?: { header?: (props: unknown) => React.ReactNode };
  }) => (
    <>
      {children}
      {mockRenderChrome && screenOptions?.header ? screenOptions.header({}) : null}
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
  const Stack = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Stack.Screen = capture(() => mockStackScreens);
  return {
    Tabs,
    Stack,
    useSegments: () => mockSegments,
    useRouter: () => ({ push: () => {} }),
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});

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
});

let mockNotificationItems: unknown[] = [];
jest.mock("../hooks/use-notifications", () => ({
  useUnreadCount: () => ({ data: 3 }),
  useNotifications: () => ({ data: { pages: [{ items: mockNotificationItems }] } }),
  useMarkRead: () => ({ mutate: () => {}, isPending: false }),
  flattenNotifications: (pages?: { items: unknown[] }[]) => pages?.flatMap((p) => p.items) ?? [],
}));

describe("v1 shell", () => {
  it("renders v1's floating tab bar with the role's tabs and the top bar", () => {
    mockRenderChrome = true;
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    const tabs = screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel);
    expect(tabs).toEqual(navByRole.STUDENT.tabs.map((t) => t.label));
    expect(screen.getByText("JPC Space")).toBeTruthy();
    expect(screen.getByLabelText("Notifications (3 unread)")).toBeTruthy();
    expect(screen.getByLabelText("User menu")).toBeTruthy();
  });

  it("lists v1's 10 most recent notifications in the bell (v1 listRecent(userId, 10))", () => {
    mockRenderChrome = true;
    mockNotificationItems = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      title: `Note ${i + 1}`,
      body: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      target: null,
    }));
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    fireEvent.press(screen.getByLabelText("Notifications (3 unread)"));
    expect(screen.getByText("Note 10")).toBeTruthy();
    expect(screen.queryByText("Note 11")).toBeNull();
    mockNotificationItems = [];
  });

  it("gives detail screens the same top bar as their header (ruling R9)", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<AppLayout />);
    const header = mockStackScreens.find((s) => s.name === "student/[id]/index")?.options?.header;
    expect(typeof header).toBe("function");
    renderWithProviders(<>{(header as () => React.ReactNode)()}</>);
    expect(screen.getByText("JPC Space")).toBeTruthy();
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

  it("puts a solid scrim under the system bar so page text can't show through it", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    renderWithProviders(<TabsLayout />);
    const style = StyleSheet.flatten(screen.getByTestId("system-bar-scrim").props.style);
    expect(style.height).toBe(34);
    expect(style.bottom).toBe(0);
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
    expect(StackErrorBoundary).toBeDefined();
    expect(TabsErrorBoundary).toBeDefined();
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

  it("never declares a screen href: null — expo-router 58 redirects a focused hidden tab to the first tab", () => {
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
      expect(all.filter((s) => s.href !== undefined).map((s) => s.name)).toEqual([]);
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
