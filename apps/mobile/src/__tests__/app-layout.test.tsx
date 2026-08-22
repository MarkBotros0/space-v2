import { render, screen } from "@testing-library/react-native";

import { navByRole } from "@space/shared";

import { useSessionStore } from "../store/session";

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
// tabs, in order" assertion in both the STUDENT and ADMIN tests (19 screens
// come back visible instead of 5); mutation (b) fails only the ADMIN
// test's ordered-names assertion, because STUDENT's tabs never include the
// "/students" href that exercises the special case — role-tabs.test.tsx's
// "routeNameForHref produces a name that exists on disk" test also catches
// it independently; mutation (c) fails the anonymous test — `getByTestId`
// throws because no <Redirect> marker renders.
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

import AppLayout from "../../app/(app)/_layout";

const scopes = {
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null as number | null,
};
const user = (role: "STUDENT" | "ADMIN") => ({
  id: 1,
  name: "A",
  email: "a@b.test",
  role,
  avatarPath: null,
});

// Hardcoded independently of routeNameForHref: the expectation must not be
// computed with the same (possibly mutated) function the layout uses, or a
// mutation to routeNameForHref would break both sides identically and the
// test would keep passing.
const STUDENT_VISIBLE_NAMES = ["calendar", "assignments", "dashboard", "quizzes", "more"];
const ADMIN_VISIBLE_NAMES = ["calendar", "groups", "dashboard", "students/index", "more"];
const TOTAL_ROUTES = 19;

beforeEach(() => {
  useSessionStore.getState().clear();
  mockScreens = [];
});

describe("AppLayout tab shell", () => {
  it("shows exactly the STUDENT tabs, in order, hiding every other route", () => {
    useSessionStore.getState().setSession(user("STUDENT"), scopes);
    render(<AppLayout />);

    expect(mockScreens).toHaveLength(TOTAL_ROUTES);

    const visible = mockScreens.filter((s) => s.href !== null);
    const hidden = mockScreens.filter((s) => s.href === null);

    expect(visible.map((s) => s.name)).toEqual(STUDENT_VISIBLE_NAMES);
    expect(hidden).toHaveLength(TOTAL_ROUTES - navByRole.STUDENT.tabs.length);
  });

  it("shows a different visible set for ADMIN", () => {
    useSessionStore.getState().setSession(user("ADMIN"), scopes);
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
});
