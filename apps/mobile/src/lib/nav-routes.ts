import type { Href } from "expo-router";
import type { NavItem, RoleNav } from "@space/shared";

/**
 * Nav data in packages/shared is plain strings; typed routes reject a bare
 * `string` (and `as Href` is banned — it would silence exactly the check we
 * want). This table is the one place a nav href becomes an `Href`: each value
 * is a literal that typecheck verifies against the real route tree, and
 * nav-routes.test.ts asserts every ALL_NAV_HREFS entry has a row.
 */
const NAV_ROUTES: Readonly<Record<string, Href>> = {
  "/assignments": "/assignments",
  "/attendance": "/attendance",
  "/calendar": "/calendar",
  "/community": "/community",
  "/coursework": "/coursework",
  "/dashboard": "/dashboard",
  "/events": "/events",
  "/groups": "/groups",
  "/history": "/history",
  "/more": "/more",
  "/notes": "/notes",
  "/notifications": "/notifications",
  "/profile": "/profile",
  "/quizzes": "/quizzes",
  "/reports": "/reports",
  "/season": "/season",
  "/seasons": "/seasons",
  "/students": "/students",
  "/submissions": "/submissions",
  "/work": "/work",
};

export function navHref(href: string): Href | null {
  return Object.prototype.hasOwnProperty.call(NAV_ROUTES, href) ? (NAV_ROUTES[href] ?? null) : null;
}

/** v1's `extraItemsFor`: sidebar entries that are not already a tab, in sidebar order. */
export function moreItemsFor(nav: RoleNav): NavItem[] {
  const tabHrefs = new Set(nav.tabs.map((tab) => tab.href));
  return nav.sidebar.filter((item) => !tabHrefs.has(item.href));
}
