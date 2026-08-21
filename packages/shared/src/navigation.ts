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
 * `tabs` is already mobile-shaped in v1: five entries with Home centred.
 */

export type NavIconName =
  | "home"
  | "dashboard"
  | "users"
  | "calendar"
  | "events"
  | "assignments"
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
  | "quizzes"
  | "more"
  | "settings";

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
    { href: "/users", label: "Users", icon: "users" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/seasons", label: "Seasons", icon: "season" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/dashboard", label: "Home", icon: "home" },
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
    { href: "/assignments", label: "Assignments", icon: "assignments" },
    { href: "/quizzes", label: "Quizzes", icon: "quizzes" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/groups", label: "Groups", icon: "groups" },
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

const LEADER: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/groups", label: "My Groups", icon: "groups" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/submissions", label: "Submissions", icon: "submissions" },
    { href: "/quizzes", label: "Quizzes", icon: "quizzes" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/groups", label: "My Group", icon: "groups" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/submissions", label: "Submissions", icon: "submissions" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

const STUDENT: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/season", label: "Current Season", icon: "season" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/assignments", label: "Assignments", icon: "assignments" },
    { href: "/quizzes", label: "Quizzes", icon: "quizzes" },
    { href: "/history", label: "History", icon: "history" },
    { href: "/profile", label: "Profile", icon: "profile" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/assignments", label: "Assignments", icon: "assignments" },
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/quizzes", label: "Quizzes", icon: "quizzes" },
    { href: "/more", label: "More", icon: "more" },
  ],
};

const MENTOR: RoleNav = {
  sidebar: [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/students", label: "Students", icon: "students" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/students", label: "Students", icon: "students" },
    { href: "/reports", label: "Reports", icon: "reports" },
    { href: "/dashboard", label: "Home", icon: "home" },
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
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
  tabs: [
    { href: "/calendar", label: "Events", icon: "events" },
    { href: "/history", label: "History", icon: "history" },
    { href: "/dashboard", label: "Home", icon: "home" },
    { href: "/profile", label: "Profile", icon: "profile" },
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
}

/** An alumnus is a graduated student — role stays STUDENT, graduationYear is set. */
export function navFor(user: NavAudience): RoleNav {
  if (user.role === "STUDENT" && user.graduationYear != null) return ALUMNI;
  return navByRole[user.role];
}
