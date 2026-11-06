import type { UserRole } from "./auth";

/**
 * Role navigation, ported from jpc-space's src/lib/navigation.ts.
 *
 * That module is pure data — no React, no Next.js — so it moves here unchanged
 * apart from one thing: hrefs are flat. v1 prefixes every path by role
 * (/student/calendar, /admin/calendar); this app has one route per destination
 * and varies the content by role, so the same item is /calendar for everyone.
 * See Decision D1 in the Phase 0 plan.
 *
 * `tabs` was mobile-shaped in v1: five entries with Home centred. The
 * redesign (plan 01 Task 12) puts Today (`/dashboard`, the `home` icon)
 * first for every role, at most five tabs. Nothing left the
 * navs: a destination that stopped being a tab is still in `sidebar`, which
 * is what More lists. MENTOR has no More tab; Profile links to Settings.
 */

export type NavIconName =
  | "home"
  | "dashboard"
  | "users"
  | "calendar"
  | "events"
  | "assignments"
  | "attendance"
  | "submissions"
  | "history"
  | "profile"
  | "reports"
  | "groups"
  | "season"
  | "students"
  | "alumni"
  | "dropped"
  | "notes"
  | "notifications"
  | "quizzes"
  | "more"
  | "settings"
  | "todo"
  | "submitted";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
}

export interface RoleNav {
  sidebar: NavItem[];
  tabs: NavItem[];
}

const SUPER: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/seasons", label: "Seasons", icon: "season" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/events", label: "JPC Events", icon: "events" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/students/alumni", label: "Alumni", icon: "alumni" },
    { href: "/students/dropped", label: "Dropped students", icon: "dropped" },
    // GET /me/notes is open to every role that can author (spec §7, R44) —
    // ADMIN, LEADER and SUPER could all write notes in v1 and none of them
    // could list what they had written. The nav has to follow in the same
    // change, or the route is reachable only by typing a URL a phone user
    // cannot type (spec D14).
    { href: "/notes", label: "My notes", icon: "notes" },
    { href: "/users", label: "Users", icon: "users" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/dashboard", label: "Today", icon: "home" },
    { href: "/seasons", label: "Seasons", icon: "season" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

const ADMIN: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/season", label: "My Season", icon: "season" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/groups", label: "Groups", icon: "groups" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/notes", label: "My notes", icon: "notes" },
    { href: "/assignments", label: "Assignments", icon: "assignments" },
    { href: "/quizzes", label: "Quizzes", icon: "quizzes" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/dashboard", label: "Today", icon: "home" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/groups", label: "Groups", icon: "groups" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

const LEADER: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/groups", label: "Groups", icon: "groups" },
    { href: "/notes", label: "My notes", icon: "notes" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/submissions", label: "Submissions", icon: "submissions" },
    { href: "/quizzes", label: "Quizzes", icon: "quizzes" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/dashboard", label: "Today", icon: "home" },
    { href: "/groups", label: "Groups", icon: "groups" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/submissions", label: "Submissions", icon: "submissions" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

const STUDENT: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/season", label: "Current Season", icon: "season" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    // Owner, 2026-11-06: the student's work is two tabs — what to do, and
    // what was handed in with its grading.
    { href: "/work", label: "To do", icon: "todo" },
    { href: "/submitted", label: "Submitted", icon: "submitted" },
    // Spec 04 D14: v1 reached /student/attendance only from the dashboard's
    // budget tile; the budget it explains must have a home of its own. STUDENT
    // sidebar only — it surfaces in More. Not ALUMNI (no active season).
    { href: "/attendance", label: "Attendance", icon: "attendance" },
    { href: "/history", label: "History", icon: "history" },
    { href: "/profile", label: "Profile", icon: "profile" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/dashboard", label: "Today", icon: "home" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/work", label: "To do", icon: "todo" },
    { href: "/submitted", label: "Submitted", icon: "submitted" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

const MENTOR: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/dashboard", label: "Today", icon: "home" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/notes", label: "Notes", icon: "notes" },
    { href: "/profile", label: "Profile", icon: "profile" },
  ],
};

// Alumni are graduated students (role STUDENT + graduationYear) — a read-only portal.
const ALUMNI: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Home", icon: "dashboard" },
    { href: "/calendar", label: "Events", icon: "events" },
    { href: "/history", label: "My History", icon: "history" },
    { href: "/profile", label: "Profile", icon: "profile" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/dashboard", label: "Today", icon: "home" },
    { href: "/calendar", label: "Events", icon: "events" },
    { href: "/history", label: "History", icon: "history" },
    { href: "/profile", label: "Profile", icon: "profile" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

/**
 * A student who is not in a season right now (between seasons, or never in
 * one): no season, work or attendance, just Today, Calendar and History.
 */
export const STUDENT_BETWEEN: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/history", label: "History", icon: "history" },
    { href: "/profile", label: "Profile", icon: "profile" },
    { href: "/notifications", label: "Notifications", icon: "notifications" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/dashboard", label: "Today", icon: "home" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/history", label: "History", icon: "history" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

export const navByRole: Record<UserRole, RoleNav> = {
  SUPER,
  ADMIN,
  LEADER,
  MENTOR,
  STUDENT,
};

export interface NavAudience {
  role: UserRole;
  graduationYear: number | null;
  /** The server-derived current season; null means the user is in none. */
  activeSeasonId: number | null;
}

/** An alumnus is a graduated student — role stays STUDENT, graduationYear is set. */
export function isAlumnus(user: Pick<NavAudience, "role" | "graduationYear">): boolean {
  return user.role === "STUDENT" && user.graduationYear != null;
}

/** Alumni get their own nav (isAlumnus); everyone else their role's. */
export function navFor(user: NavAudience): RoleNav {
  if (isAlumnus(user)) return ALUMNI;
  if (user.role === "STUDENT" && user.activeSeasonId == null) return STUDENT_BETWEEN;
  return navByRole[user.role];
}

/**
 * Every href across every nav's `tabs` + `sidebar`, deduped. Exported so
 * callers can build it once from the given navs — used below to build
 * `ALL_NAV_HREFS`, and reusable in tests against synthetic nav data.
 */
export function hrefUnion(navs: readonly RoleNav[]): string[] {
  return Array.from(
    new Set(navs.flatMap((nav) => [...nav.tabs, ...nav.sidebar]).map((item) => item.href)),
  );
}

/** All seven navs: navByRole plus ALUMNI and STUDENT_BETWEEN, which only navFor reaches. */
const ALL_NAVS: readonly RoleNav[] = [SUPER, ADMIN, LEADER, MENTOR, STUDENT, ALUMNI, STUDENT_BETWEEN];

/**
 * The complete href union across all seven navs, ALUMNI included.
 * `Object.values(navByRole)` alone omits ALUMNI — it's reachable only
 * through `navFor`, not through `navByRole` — so anything that needs the
 * full route universe (the mobile app's tab-bar shell derives its route
 * list from this) must consume this export rather than re-deriving the
 * union from `navByRole` and silently dropping every ALUMNI-only href.
 */
export const ALL_NAV_HREFS: readonly string[] = hrefUnion(ALL_NAVS);

/**
 * Every href that is a tab for at least one nav, ALUMNI included — built
 * from the same seven navs as `ALL_NAV_HREFS`. The mobile app keeps these
 * routes in its `Tabs` group; every other nav href (Settings, Notifications,
 * Events, …: a More entry for every role that has it, a Profile link for
 * MENTOR) pushes on the stack above the tabs, so Back from it returns to the
 * screen it was opened from. Derived, never re-listed.
 */
export const ALL_TAB_HREFS: readonly string[] = Array.from(
  new Set(ALL_NAVS.flatMap((nav) => nav.tabs).map((item) => item.href)),
);
