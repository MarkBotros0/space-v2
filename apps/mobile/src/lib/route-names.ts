/**
 * Hrefs whose route is a directory (`x/index.tsx`) because the destination
 * has child routes (ruling X7): `students` (alumni, dropped), `seasons`
 * (Plan 6's `seasons/[code]/…`) and `users` (`users/new`, Plan 17's `users/import`). Without the mapping the tab bar looks for
 * a file named "seasons" and silently omits the tab.
 */
export const DIRECTORY_ROUTE_HREFS = new Set(["students", "seasons", "users"]);

/**
 * href → route name (the `name` prop `Tabs.Screen` expects, which is the
 * file path relative to `app/(app)/`, extension dropped). Lives here rather
 * than in the layout so the tab bar can use it without an import cycle.
 */
export function routeNameForHref(href: string): string {
  const path = href.slice(1);
  return DIRECTORY_ROUTE_HREFS.has(path) ? `${path}/index` : path;
}
