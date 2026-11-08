import { ALL_NAV_HREFS, ALL_TAB_HREFS } from "@space/shared";

/**
 * Hrefs whose route is a directory (`x/index.tsx`) because the destination
 * has child routes (ruling X7): `students` (alumni, dropped), `seasons`
 * (Plan 6's `seasons/[code]/…`) `users` (`users/new`, Plan 17's `users/import`) and `announcements` (`announcements/[id]`, `announcements/new`). Without the mapping the tab bar looks for
 * a file named "seasons" and silently omits the tab.
 */
export const DIRECTORY_ROUTE_HREFS = new Set(["students", "seasons", "users", "announcements"]);

/**
 * href → route name (the `name` prop `Tabs.Screen` or `Stack.Screen`
 * expects: the file path relative to its navigator's group — `app/(app)/(tabs)/`
 * for a tab route, `app/(app)/` for one pushed on the stack — extension
 * dropped). Lives here rather than in a layout so the tab bar can use it
 * without an import cycle.
 */
export function routeNameForHref(href: string): string {
  const path = href.slice(1);
  return DIRECTORY_ROUTE_HREFS.has(path) ? `${path}/index` : path;
}

const unique = (names: string[]): readonly string[] => Array.from(new Set(names));

/**
 * The route files in `(tabs)/`: every href that is a tab for at least one
 * role (`ALL_TAB_HREFS`, ALUMNI included). A route that is a tab for one role
 * and a More entry for another (/notes, /reports, /history, …) stays here:
 * the tabs go Back through their history, so it still returns to More (R19).
 */
export const TAB_ROUTE_NAMES: readonly string[] = unique(ALL_TAB_HREFS.map(routeNameForHref));

/**
 * Nav destinations that are a tab for NO role (Settings, Notifications,
 * Events, …): only ever opened from More, Profile or a link, so they live in
 * `app/(app)/` and push on the stack above the tabs like a detail screen —
 * Back pops them to wherever they were opened from (ruling R19). Derived:
 * the rest of `ALL_NAV_HREFS` once the tab hrefs are taken out.
 */
export const PUSHED_NAV_ROUTE_NAMES: readonly string[] = unique(
  ALL_NAV_HREFS.filter((href) => !ALL_TAB_HREFS.includes(href)).map(routeNameForHref),
);
