import { Tabs } from "expo-router";
import { useMemo } from "react";
import type { NavItem } from "@space/shared";

import { ScreenErrorBoundary } from "../../../src/design/layout/error-boundary";
import { PillTabBar } from "../../../src/design/layout/floating-tab-bar";
import { TabBarPresenceContext } from "../../../src/design/layout/shell-context";
import { useResetTabBarOnFocus } from "../../../src/design/layout/use-reset-tab-bar-on-focus";
import { DIRECTORY_ROUTE_HREFS, TAB_ROUTE_NAMES, routeNameForHref } from "../../../src/lib/route-names";
import { historyThenHomeTabsRouter } from "../../../src/lib/tabs-back-router";
import { useSessionStore } from "../../../src/store/session";

// Re-exported: tests read these from the layout that consumes them.
export { DIRECTORY_ROUTE_HREFS, routeNameForHref };

/** A tab screen that throws while rendering shows a retry, not a crashed app. */
export const ErrorBoundary = ScreenErrorBoundary;

/**
 * Home is the root of the tabs for every role (every nav has `/dashboard`).
 * It is the tab under a detail screen opened cold from a deep link, and the
 * tab seeded under a cold link to another tab. Without it the seeded tab is
 * whichever route sorts first in the route tree (it was More).
 * Expo Router 58 only goes *Back* to a non-stack anchor with
 * `backBehavior: "initialRoute"`; these tabs use "history" and get
 * Back-to-Home from historyThenHomeTabsRouter instead (ruling R19,
 * src/lib/tabs-back-router.ts).
 *
 * EXPECTED DEV WARNING — do not "fix" it: in __DEV__ expo-router logs once
 * that this navigator "sets the anchor "dashboard", but its backBehavior is
 * "history"". Switching to "initialRoute" silences it and breaks R19: Back
 * from a More destination that is a tab route (a leader's My notes, an
 * admin's Reports) would go Home instead of to More. more-back.test.tsx fails
 * if that happens.
 */
export const unstable_settings = { anchor: "dashboard" };

/**
 * The route files in this group: every href that is a tab for at least one
 * role, ALUMNI included (`TAB_ROUTE_NAMES`, derived from
 * packages/shared's `ALL_TAB_HREFS`). A role gaining a tab needs no edit
 * here. Nav destinations that are a tab for no role (Settings, Events, …)
 * are not here: they live one level up and push on the stack in
 * `(app)/_layout.tsx` (PUSHED_NAV_ROUTE_NAMES), so Back returns to More.
 * Detail routes are not here either (DETAIL_ROUTE_NAMES). `Tabs`
 * auto-registers every file in this directory regardless, but this list is
 * also what decides the *order* screens are declared in below.
 * app-layout-routes.test.tsx checks it against the files on disk.
 */
export const ALL_ROUTE_NAMES: readonly string[] = TAB_ROUTE_NAMES;

/**
 * `(app)/(tabs)/_layout.tsx` — the `Tabs` navigator for every destination
 * that is a tab for some role (Decision D1), the bottom of the `(app)` stack.
 * `Tabs` picks up all route files in this directory automatically; the
 * floating tab bar draws only the role's `tabs`, so the others (a leader's
 * My notes, an admin's Reports) are reachable by navigation and absent from
 * the bar.
 *
 * Never mark a screen `href: null` (or `hidden: true`). Since expo-router 58,
 * `Tabs` turns `href: null` into `hidden: true`, and a focused hidden screen
 * is `router.replace`d to the initial tab (useVisibleTabsWithRedirect): every
 * deep link, notification tap and `router.push` to a non-tab screen landed on
 * the first tab instead. What keeps a screen out of the bar is
 * PillTabBar rendering `items`, not the screen's options.
 */
export default function TabsLayout() {
  // Selector-call form (ruling P11): `nav` is a stable function, calling it
  // here (not just selecting it) is what makes this re-render when the
  // user's role/scopes change. navFor() returns module-level constants, so
  // Object.is holds across calls with the same inputs and this can't loop.
  const nav = useSessionStore((s) => s.nav());
  useResetTabBarOnFocus();
  // Tabs switch instantly, as native tab bars do (owner, 2026-11-07: calm
  // and quick; the pill's highlight is the only thing that moves).
  const screenOptions = useMemo(() => ({ headerShown: false, animation: "none" as const }), []);

  const tabs: NavItem[] = nav?.tabs ?? [];
  const tabByRouteName = new Map(tabs.map((tab) => [routeNameForHref(tab.href), tab]));

  // Visible tabs first, in the role's tab order (Today first); every other
  // destination follows in any order — screens outside
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
        backBehavior="history"
        UNSTABLE_router={historyThenHomeTabsRouter}
        screenOptions={screenOptions}
        tabBar={(props) => <PillTabBar {...props} items={tabs} />}
      >
        {orderedRouteNames.map((name) => {
          const tab = tabByRouteName.get(name);
          return <Tabs.Screen key={name} name={name} options={tab ? { title: tab.label } : NOT_A_TAB} />;
        })}
      </Tabs>
    </TabBarPresenceContext.Provider>
  );
}

/** A screen outside the role's tabs: no title, and deliberately NOT `href: null` (see TabsLayout). */
const NOT_A_TAB = {};
