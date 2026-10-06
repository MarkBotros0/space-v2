import { render, screen } from "@testing-library/react-native";

import { navByRole } from "@space/shared";

import { useSessionStore } from "../store/session";
import { listRouteNames } from "./helpers/routes";
import { makeScopes, makeUser } from "./helpers/session";

// Task-7 fix round, Fix 1: nothing in the suite before this file ever
// rendered `app/(app)/_layout.tsx` — role-tabs.test.tsx only exercises
// navByRole/navFor and the filesystem. Three mutations to the layout each
// left the whole suite green:
//   (a) replacing the `tab ? {...} : { href: null }` branch with an
//       unconditional visible-tab object — every route becomes a tab
//   (b) gutting routeNameForHref to `return path` (dropping the
//       "students" -> "students/index" special case)
//   (c) deleting the `status === "anonymous"` -> <Redirect> guard
// This file renders `AppLayout` for real (`Tabs`/`Tabs.Screen`/`Redirect`
// mocked to markers, the same technique boot-gate.test.tsx uses for
// `Stack` — the real navigator needs a context this test has no interest
// in setting up) and asserts on the `name`/`options` each `Tabs.Screen`
// actually receives, so all three mutations fail here.
//
// Verified (see task report for how): mutation (a) fails the "visible
// tabs, in order" assertion in both the STUDENT and ADMIN tests; mutation
// (b) fails only the ADMIN test's ordered-names assertion, because
// STUDENT's tabs never include the "/students" href that exercises the
// special case — role-tabs.test.tsx's "routeNameForHref produces a name that
// exists on disk" test also catches it independently; mutation (c) fails the
// anonymous test — `getByTestId` throws because no <Redirect> marker renders.
//
// Plan 1 Task 0 (ruling X9): the route total is DERIVED from the layout's
// own exported lists, not pinned. Every plan that adds a route used to have
// to bump a hardcoded 19 here; now it appends to DETAIL_ROUTE_NAMES and the
// "every route file is declared" test below — which reads the filesystem,
// independently of the layout — is what keeps that list honest.
type CapturedScreen = { name: string; title?: string; href?: string | null };
let mockScreens: CapturedScreen[] = [];

jest.mock("expo-router", () => {
  const { Text } = require("react-native");
  const TabsScreen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => {
    mockScreens.push({
      name,
      title: options?.title as string | undefined,
      href: options && "href" in options ? (options.href as string | null) : undefined,
    });
    return null;
  };
  const Tabs = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Tabs.Screen = TabsScreen;
  return {
    Tabs,
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});

import AppLayout, {
  ALL_ROUTE_NAMES,
  DETAIL_ROUTE_NAMES,
  routeNameForHref,
} from "../../app/(app)/_layout";

const scopes = makeScopes();

// Hardcoded independently of routeNameForHref: the expectation must not be
// computed with the same (possibly mutated) function the layout uses, or a
// mutation to routeNameForHref would break both sides identically and the
// test would keep passing.
const STUDENT_VISIBLE_NAMES = ["calendar", "assignments", "dashboard", "quizzes", "more"];
const ADMIN_VISIBLE_NAMES = ["calendar", "groups", "dashboard", "students/index", "more"];
const TOTAL_ROUTES = ALL_ROUTE_NAMES.length + DETAIL_ROUTE_NAMES.length;

beforeEach(() => {
  useSessionStore.getState().clear();
  mockScreens = [];
});

describe("AppLayout tab shell", () => {
  it("shows exactly the STUDENT tabs, in order, hiding every other route", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    render(<AppLayout />);

    expect(mockScreens).toHaveLength(TOTAL_ROUTES);

    const visible = mockScreens.filter((s) => s.href !== null);
    const hidden = mockScreens.filter((s) => s.href === null);

    expect(visible.map((s) => s.name)).toEqual(STUDENT_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_ROUTES - navByRole.STUDENT.tabs.length);
  });

  it("shows a different visible set for ADMIN", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    render(<AppLayout />);

    expect(mockScreens).toHaveLength(TOTAL_ROUTES);

    const visible = mockScreens.filter((s) => s.href !== null);
    const hidden = mockScreens.filter((s) => s.href === null);

    expect(visible.map((s) => s.name)).toEqual(ADMIN_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_ROUTES - navByRole.ADMIN.tabs.length);
    expect(visible.map((s) => s.name)).not.toEqual(STUDENT_VISIBLE_NAMES);
  });

  it("renders the redirect and no Tabs.Screen when anonymous", () => {
    useSessionStore.setState({ status: "anonymous" });
    render(<AppLayout />);

    expect(screen.getByTestId("redirect")).toHaveTextContent("/login");
    expect(mockScreens).toHaveLength(0);
  });
  it("declares every route file under app/(app), so none can leak into the tab bar", () => {
    // `Tabs` auto-registers every file in the directory; one the layout does
    // not declare renders AS A TAB. The left side is read from disk, not from
    // the layout, so a new route file without a DETAIL_ROUTE_NAMES entry
    // fails here even though the derived TOTAL_ROUTES above would not notice.
    expect(new Set(listRouteNames())).toEqual(new Set([...ALL_ROUTE_NAMES, ...DETAIL_ROUTE_NAMES]));
  });

  it("declares every detail route with href: null", () => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    render(<AppLayout />);

    for (const name of DETAIL_ROUTE_NAMES) {
      const declared = mockScreens.find((s) => s.name === name);
      expect(declared).toBeDefined();
      expect(declared?.href).toBeNull();
    }
  });

  it("registers the assignment detail, edit and new routes as hidden detail routes (X7)", () => {
    const names = ["assignment/[id]/index", "assignment/[id]/edit", "assignment/new"];
    for (const name of names) expect(DETAIL_ROUTE_NAMES).toContain(name);
    // The file form must be gone: x/[id].tsx beside x/[id]/ is the ambiguity X7 forbids.
    expect(DETAIL_ROUTE_NAMES).not.toContain("assignment/[id]");

    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    render(<AppLayout />);

    for (const name of names) {
      expect(mockScreens.find((s) => s.name === name)?.href).toBeNull();
    }
  });

  it("registers the leader-path detail routes as hidden", () => {
    for (const name of ["group/[id]/index", "submission/[publicId]", "session/[id]/attendance"]) {
      expect(DETAIL_ROUTE_NAMES).toContain(name);
    }
  });

  it("registers session/[id]/index as a hidden detail route", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    render(<AppLayout />);
    const detail = mockScreens.find((s) => s.name === "session/[id]/index");
    expect(detail).toBeDefined();
    expect(detail?.href).toBeNull();
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

  it.each(["quiz/[id]/index", "quiz/[id]/grade", "quiz/[id]/edit", "quiz/new"])("registers %s as a hidden detail route", (name) => {
    useSessionStore.getState().setSession(makeUser("STUDENT"), scopes);
    render(<AppLayout />);
    const detail = mockScreens.find((s) => s.name === name);
    expect(detail).toBeDefined();
    expect(detail?.href).toBeNull();
  });

  it("maps the /seasons tab to its directory route, like /students", () => {
    expect(routeNameForHref("/seasons")).toBe("seasons/index");
    expect(routeNameForHref("/students")).toBe("students/index");
    expect(routeNameForHref("/calendar")).toBe("calendar");
  });

  it("declares student/[id]/index hidden from the tab bar (directory form, ruling X7)", () => {
    useSessionStore.getState().setSession(makeUser("ADMIN"), scopes);
    render(<AppLayout />);
    const detail = mockScreens.find((s) => s.name === "student/[id]/index");
    expect(detail).toBeDefined();
    expect(detail?.href).toBeNull();
  });
});
