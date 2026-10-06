import { Redirect, Tabs } from "expo-router";
import type { NavItem } from "@space/shared";
import { ALL_NAV_HREFS } from "@space/shared";

import { NavIcon } from "../../src/components/NavIcon";
import { useSessionStore } from "../../src/store/session";

/**
 * Hrefs whose route is a directory (`x/index.tsx`) because the destination
 * has child routes (ruling X7): `students` (alumni, dropped) and `seasons`
 * (Plan 6's `seasons/[code]/…`). Without the mapping the tab bar looks for
 * a file named "seasons" and silently omits the tab.
 */
const DIRECTORY_ROUTE_HREFS = new Set(["students", "seasons"]);

/**
 * href → route name (the `name` prop `Tabs.Screen` expects, which is the
 * file path relative to this directory, extension dropped). Exported (not just
 * used locally) so tests can check its output against what actually exists
 * on disk instead of trusting the hardcoded cases here.
 */
export function routeNameForHref(href: string): string {
  const path = href.slice(1);
  return DIRECTORY_ROUTE_HREFS.has(path) ? `${path}/index` : path;
}

/**
 * The full universe of route files under this group, derived from
 * `ALL_NAV_HREFS` (packages/shared/src/navigation.ts) — the complete href
 * union across every nav's `tabs` + `sidebar`, ALUMNI included. A role
 * gaining a new tab or sidebar entry (with a route file added to match)
 * needs no edit here: this list and role-tabs.test.tsx's route-coverage
 * check both consume that one shared export, so there's nowhere left for
 * the two to independently re-derive the union and drift (ALUMNI is only
 * reachable through `navFor`, not `navByRole`, which is exactly what let
 * this list omit it before `ALL_NAV_HREFS` existed).
 * `Tabs` auto-registers every file in this directory regardless, but this
 * list is also what decides the *order* screens are declared in below,
 * which is what puts "Home" in the middle of a 5-tab bar for a role that
 * has it there.
 */
export const ALL_ROUTE_NAMES: readonly string[] = Array.from(
  new Set(ALL_NAV_HREFS.map(routeNameForHref)),
);

/**
 * Detail routes: reachable by navigation, never tabs. They are not in any
 * nav's hrefs, so ALL_ROUTE_NAMES cannot know about them — but `Tabs`
 * auto-registers every file in this directory, and an undeclared screen
 * appears IN the tab bar. Every route file under (app)/ that is not a nav
 * href is listed here; app-layout.test.tsx reads the filesystem and fails if
 * one is missing, and pins that each entry is declared with href: null.
 * Plans add a detail route by appending to this list — nothing else.
 */
export const DETAIL_ROUTE_NAMES: readonly string[] = [
  "assignment/[id]/index",
  "assignment/[id]/edit",
  "assignment/new",
  "group/[id]/index",
  "submission/[publicId]",
  "session/[id]/attendance",
  "session/[id]/index",
  "seasons/[code]/index",
  "seasons/[code]/edit",
  "seasons/[code]/roster/index",
  "group/new",
  "group/[id]/edit",
  "session/new",
  "session/[id]/edit",
  "quiz/[id]/index",
  "quiz/[id]/grade",
  "quiz/new",
  "quiz/[id]/edit",
  "student/[id]",
  "user/[id]",
];

/**
 * `(app)/_layout.tsx` — the `Tabs` navigator every authenticated screen
 * plugs into (Decision D1). `Tabs` picks up all route files in this
 * directory automatically, so every screen not in the current role's
 * `tabs` gets `options={{ href: null }}`: reachable by navigation, absent
 * from the bar.
 */
export default function AppLayout() {
  const status = useSessionStore((s) => s.status);
  // Selector-call form (ruling P11): `nav` is a stable function, calling it
  // here (not just selecting it) is what makes this re-render when the
  // user's role/scopes change. navFor() returns module-level constants, so
  // Object.is holds across calls with the same inputs and this can't loop.
  const nav = useSessionStore((s) => s.nav());

  // The boot gate (Task 6, app/_layout.tsx) has already resolved "idle" and
  // "restoring" by the time this mounts — the only unauthenticated status
  // this can see is "anonymous".
  if (status === "anonymous") return <Redirect href="/login" />;

  const tabs: NavItem[] = nav?.tabs ?? [];
  const tabByRouteName = new Map(tabs.map((tab) => [routeNameForHref(tab.href), tab]));

  // Visible tabs first, in the role's tab order (this is what centers
  // "Home"); every other route follows in any order — hidden screens don't
  // appear in the bar, so their relative order doesn't matter.
  const orderedRouteNames = [
    ...tabs.map((tab) => routeNameForHref(tab.href)),
    ...ALL_ROUTE_NAMES.filter((name) => !tabByRouteName.has(name)),
    ...DETAIL_ROUTE_NAMES,
  ];

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {orderedRouteNames.map((name) => {
        const tab = tabByRouteName.get(name);
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={
              tab
                ? {
                    title: tab.label,
                    tabBarIcon: ({ color, size }) => (
                      <NavIcon name={tab.icon} color={color} size={size} />
                    ),
                  }
                : { href: null }
            }
          />
        );
      })}
    </Tabs>
  );
}
