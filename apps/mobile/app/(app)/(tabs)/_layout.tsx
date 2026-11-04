import { Tabs } from "expo-router";
import type { NavItem } from "@space/shared";
import { ALL_NAV_HREFS } from "@space/shared";

import { ScreenErrorBoundary } from "../../../src/design/layout/error-boundary";
import { FloatingTabBar } from "../../../src/design/layout/floating-tab-bar";
import { TabBarPresenceContext } from "../../../src/design/layout/shell-context";
import { DIRECTORY_ROUTE_HREFS, routeNameForHref } from "../../../src/lib/route-names";
import { useSessionStore } from "../../../src/store/session";

// Re-exported: tests read these from the layout that consumes them.
export { DIRECTORY_ROUTE_HREFS, routeNameForHref };

/** A tab screen that throws while rendering shows a retry, not a crashed app. */
export const ErrorBoundary = ScreenErrorBoundary;

/**
 * Home is the root of the tabs for every role (every nav has `/dashboard`).
 * It is the tab under a detail screen opened cold from a deep link, and what
 * Back from another tab returns to. Without it the seeded tab under a cold
 * deep link is whichever route sorts first in the route tree (it was More).
 * An anchor on a non-stack navigator only takes effect with
 * `backBehavior: "initialRoute"` (expo-router 58 warns otherwise).
 */
export const unstable_settings = { anchor: "dashboard" };

/**
 * The full universe of route files in this group, derived from
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
 * has it there. Detail routes are not here: they live one level up, on the
 * stack in `(app)/_layout.tsx` (DETAIL_ROUTE_NAMES).
 */
export const ALL_ROUTE_NAMES: readonly string[] = Array.from(
  new Set(ALL_NAV_HREFS.map(routeNameForHref)),
);

/**
 * `(app)/(tabs)/_layout.tsx` — the `Tabs` navigator for every nav
 * destination (Decision D1), the bottom of the `(app)` stack. `Tabs` picks up
 * all route files in this directory automatically; the floating tab bar
 * draws only the role's `tabs`, so the other destinations (Settings,
 * Notifications, …) are reachable by navigation and absent from the bar.
 *
 * Never mark a screen `href: null` (or `hidden: true`). Since expo-router 58,
 * `Tabs` turns `href: null` into `hidden: true`, and a focused hidden screen
 * is `router.replace`d to the initial tab (useVisibleTabsWithRedirect): every
 * deep link, notification tap and `router.push` to a non-tab screen landed on
 * the first tab instead. What keeps a screen out of the bar is
 * FloatingTabBar rendering `items`, not the screen's options.
 */
export default function TabsLayout() {
  // Selector-call form (ruling P11): `nav` is a stable function, calling it
  // here (not just selecting it) is what makes this re-render when the
  // user's role/scopes change. navFor() returns module-level constants, so
  // Object.is holds across calls with the same inputs and this can't loop.
  const nav = useSessionStore((s) => s.nav());

  const tabs: NavItem[] = nav?.tabs ?? [];
  const tabByRouteName = new Map(tabs.map((tab) => [routeNameForHref(tab.href), tab]));

  // Visible tabs first, in the role's tab order (this is what centers
  // "Home"); every other destination follows in any order — screens outside
  // the role's tabs don't appear in the bar, so their relative order doesn't
  // matter.
  const orderedRouteNames = [
    ...tabs.map((tab) => routeNameForHref(tab.href)),
    ...ALL_ROUTE_NAMES.filter((name) => !tabByRouteName.has(name)),
  ];

  // The floating pill tab bar renders the role's tabs itself. No header: each
  // screen's frame (`Screen`) owns the top inset, the offline strip and its
  // title (ruling R14). Screens here have the pill under them, so their
  // content clears it (ruling R15). The system-bar scrim is drawn by the
  // stack layout above, for every screen.
  return (
    <TabBarPresenceContext.Provider value={true}>
      <Tabs
        backBehavior="initialRoute"
        screenOptions={TAB_SCREEN_OPTIONS}
        tabBar={(props) => <FloatingTabBar {...props} items={tabs} />}
      >
        {orderedRouteNames.map((name) => {
          const tab = tabByRouteName.get(name);
          return <Tabs.Screen key={name} name={name} options={tab ? { title: tab.label } : NOT_A_TAB} />;
        })}
      </Tabs>
    </TabBarPresenceContext.Provider>
  );
}

const TAB_SCREEN_OPTIONS = { headerShown: false } as const;

/** A screen outside the role's tabs: no title, and deliberately NOT `href: null` (see TabsLayout). */
const NOT_A_TAB = {};
