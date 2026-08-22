import { Redirect, Tabs } from "expo-router";
import type { NavItem } from "@space/shared";
import { ALL_NAV_HREFS } from "@space/shared";

import { NavIcon } from "../../src/components/NavIcon";
import { useSessionStore } from "../../src/store/session";

/**
 * href → route name (the `name` prop `Tabs.Screen` expects, which is the
 * file path relative to this directory, extension dropped). `students` is
 * the one href that maps to a directory rather than a sibling file — see
 * R1 in the task-7 brief; without this the tab bar would look for a file
 * named "students" instead of "students/index" and silently omit the tab.
 * Exported (not just used locally) so tests can check its output against
 * what actually exists on disk instead of trusting the hardcoded case here.
 */
export function routeNameForHref(href: string): string {
  const path = href.slice(1);
  return path === "students" ? "students/index" : path;
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
const ALL_ROUTE_NAMES = Array.from(new Set(ALL_NAV_HREFS.map(routeNameForHref)));

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
