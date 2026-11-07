import { ALL_NAV_HREFS, ALL_TAB_HREFS, STUDENT_BETWEEN, isAlumnus, isStudyingAlumnus, navByRole, navFor } from "../navigation";
import type { RoleNav } from "../navigation";

const base = { role: "STUDENT" as const, graduationYear: null as number | null, activeSeasonId: 1 as number | null };

describe("navFor", () => {
  it("returns the alumni nav for a graduated student", () => {
    const nav = navFor({ role: "STUDENT", graduationYear: 2024, activeSeasonId: null });
    expect(nav.tabs.map((t) => t.label)).toEqual(["Home", "Events", "History", "Profile", "More"]);
  });

  it("returns the student nav for an active student", () => {
    const nav = navFor(base);
    expect(nav).toBe(navByRole.STUDENT);
  });

  it("ignores graduationYear for non-students", () => {
    // Only a STUDENT can be an alumnus. A LEADER with a graduation year is a
    // graduate who now leads — they get the leader app.
    expect(navFor({ role: "LEADER", graduationYear: 2024, activeSeasonId: null })).toBe(navByRole.LEADER);
  });

  const ALUMNI = navFor({ role: "STUDENT", graduationYear: 2024, activeSeasonId: null });
  const ALL_NAVS: Record<string, RoleNav> = { ...navByRole, ALUMNI };

  it("puts Today first for every role, at most five tabs (redesign plan 01 Task 12)", () => {
    for (const [role, nav] of Object.entries(ALL_NAVS)) {
      expect([role, nav.tabs[0]]).toEqual([
        role,
        { href: "/dashboard", label: "Home", icon: "home" },
      ]);
      expect(nav.tabs.length).toBeLessThanOrEqual(5);
      expect(nav.sidebar.length).toBeGreaterThan(0);
    }
  });

  it("gives the home icon (the pill's featured tab) to Today alone", () => {
    for (const nav of Object.values(ALL_NAVS)) {
      expect(nav.tabs.filter((t) => t.icon === "home").map((t) => t.href)).toEqual(["/dashboard"]);
    }
  });

  it("removes nothing: each role reaches the same destinations it did before Today moved first", () => {
    // Frozen from the pre-Task-12 navs: anything leaving the tabs stays in the
    // sidebar, so it is still listed in More.
    const before: Record<string, string[]> = {
      SUPER: [
        "/calendar",
        "/dashboard",
        "/events",
        "/more",
        "/notes",
        "/notifications",
        "/reports",
        "/seasons",
        "/settings/notifications",
        "/settings/profile",
        "/students",
        "/students/alumni",
        "/students/dropped",
        "/users",
      ],
      ADMIN: [
        "/assignments",
        "/calendar",
        "/dashboard",
        "/groups",
        "/more",
        "/notes",
        "/notifications",
        "/quizzes",
        "/reports",
        "/season",
        "/settings/notifications",
        "/settings/profile",
        "/students",
      ],
      LEADER: [
        "/calendar",
        "/dashboard",
        "/groups",
        "/more",
        "/notes",
        "/notifications",
        "/quizzes",
        "/settings/notifications",
        "/settings/profile",
        "/submissions",
      ],
      MENTOR: [
        "/dashboard",
        "/notes",
        "/notifications",
        "/profile",
        "/reports",
        "/settings/notifications",
        "/settings/profile",
        "/students",
      ],
      STUDENT: [
        "/attendance",
        "/calendar",
        "/dashboard",
        "/history",
        "/more",
        "/notifications",
        "/profile",
        "/season",
        "/settings/notifications",
        "/settings/profile",
        "/submitted",
        "/work",
      ],
      ALUMNI: [
        "/calendar",
        "/dashboard",
        "/history",
        "/more",
        "/notifications",
        "/profile",
        "/settings/notifications",
        "/settings/profile",
      ],
    };
    for (const [role, nav] of Object.entries(ALL_NAVS)) {
      const union = [...new Set([...nav.tabs, ...nav.sidebar].map((i) => i.href))].sort();
      expect([role, union]).toEqual([role, before[role]]);
    }
  });

  it("ALL_TAB_HREFS is every href that is a tab for at least one nav, ALUMNI included", () => {
    const expected = new Set(Object.values(ALL_NAVS).flatMap((nav) => nav.tabs.map((t) => t.href)));
    expect(new Set(ALL_TAB_HREFS)).toEqual(expected);
    expect(ALL_TAB_HREFS).toHaveLength(expected.size);
    for (const href of ALL_TAB_HREFS) expect(ALL_NAV_HREFS).toContain(href);
  });

  it("uses flat hrefs, not v1's role-prefixed ones", () => {
    // Decision D1: one route per destination, content varies by role.
    for (const nav of Object.values(navByRole)) {
      for (const item of [...nav.tabs, ...nav.sidebar]) {
        expect(item.href).toMatch(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/);
        expect(item.href).not.toMatch(/^\/(super|admin|leader|student|mentor|alumni)\//);
      }
    }
  });

  it("pins every nav item so an accidental edit fails loudly", () => {
    // The manual v1 comparison that verified this port cannot be repeated on
    // every change; this is that comparison, frozen. Update it only when v1's
    // navigation genuinely changes.
    const shape = (nav: RoleNav) => ({
      sidebar: nav.sidebar.map((i) => [i.href, i.label, i.icon]),
      tabs: nav.tabs.map((i) => [i.href, i.label, i.icon]),
    });

    expect(shape(navByRole.SUPER)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/seasons", "Seasons", "season"],
        ["/calendar", "Calendar", "calendar"],
        ["/events", "JPC Events", "events"],
        ["/students", "Students", "students"],
        ["/students/alumni", "Alumni", "alumni"],
        ["/students/dropped", "Dropped students", "dropped"],
        ["/notes", "My notes", "notes"],
        ["/users", "Users", "users"],
        ["/reports", "Reports", "reports"],
        ["/notifications", "Notifications", "notifications"],
        ["/settings/profile", "Profile settings", "settings"],
        ["/settings/notifications", "Notification settings", "notifications"],
      ],
      tabs: [
        ["/dashboard", "Home", "home"],
        ["/seasons", "Seasons", "season"],
        ["/calendar", "Calendar", "calendar"],
        ["/students", "Students", "students"],
        ["/more", "More", "more"],
      ],
    });

    expect(shape(navByRole.ADMIN)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/season", "My Season", "season"],
        ["/calendar", "Calendar", "calendar"],
        ["/groups", "Groups", "groups"],
        ["/students", "Students", "students"],
        ["/notes", "My notes", "notes"],
        ["/assignments", "Assignments", "assignments"],
        ["/quizzes", "Quizzes", "quizzes"],
        ["/reports", "Reports", "reports"],
        ["/notifications", "Notifications", "notifications"],
        ["/settings/profile", "Profile settings", "settings"],
        ["/settings/notifications", "Notification settings", "notifications"],
      ],
      tabs: [
        ["/dashboard", "Home", "home"],
        ["/calendar", "Calendar", "calendar"],
        ["/groups", "Groups", "groups"],
        ["/students", "Students", "students"],
        ["/more", "More", "more"],
      ],
    });

    expect(shape(navByRole.LEADER)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/groups", "Groups", "groups"],
        ["/notes", "My notes", "notes"],
        ["/calendar", "Calendar", "calendar"],
        ["/submissions", "Submissions", "submissions"],
        ["/quizzes", "Quizzes", "quizzes"],
        ["/notifications", "Notifications", "notifications"],
        ["/settings/profile", "Profile settings", "settings"],
        ["/settings/notifications", "Notification settings", "notifications"],
      ],
      tabs: [
        ["/dashboard", "Home", "home"],
        ["/groups", "Groups", "groups"],
        ["/calendar", "Calendar", "calendar"],
        ["/submissions", "Submissions", "submissions"],
        ["/more", "More", "more"],
      ],
    });

    expect(shape(navByRole.STUDENT)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/season", "Current Season", "season"],
        ["/calendar", "Calendar", "calendar"],
        ["/work", "To do", "todo"],
        ["/submitted", "Submitted", "submitted"],
        ["/attendance", "Attendance", "attendance"],
        ["/history", "History", "history"],
        ["/profile", "Profile", "profile"],
        ["/notifications", "Notifications", "notifications"],
        ["/settings/profile", "Profile settings", "settings"],
        ["/settings/notifications", "Notification settings", "notifications"],
      ],
      tabs: [
        ["/dashboard", "Home", "home"],
        ["/calendar", "Calendar", "calendar"],
        ["/work", "To do", "todo"],
        ["/submitted", "Submitted", "submitted"],
        ["/more", "More", "more"],
      ],
    });

    expect(shape(navByRole.MENTOR)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/students", "Students", "students"],
        ["/reports", "Reports", "reports"],
        ["/notifications", "Notifications", "notifications"],
        ["/settings/profile", "Profile settings", "settings"],
        ["/settings/notifications", "Notification settings", "notifications"],
      ],
      tabs: [
        ["/dashboard", "Home", "home"],
        ["/students", "Students", "students"],
        ["/reports", "Reports", "reports"],
        ["/notes", "Notes", "notes"],
        ["/profile", "Profile", "profile"],
      ],
    });

    const alumni = navFor({ role: "STUDENT", graduationYear: 2024, activeSeasonId: null });
    expect(shape(alumni)).toEqual({
      sidebar: [
        ["/dashboard", "Home", "dashboard"],
        ["/calendar", "Events", "events"],
        ["/history", "My History", "history"],
        ["/profile", "Profile", "profile"],
        ["/notifications", "Notifications", "notifications"],
        ["/settings/profile", "Profile settings", "settings"],
        ["/settings/notifications", "Notification settings", "notifications"],
      ],
      tabs: [
        ["/dashboard", "Home", "home"],
        ["/calendar", "Events", "events"],
        ["/history", "History", "history"],
        ["/profile", "Profile", "profile"],
        ["/more", "More", "more"],
      ],
    });
  });
});

describe("navFor between seasons", () => {
  const hrefs = (a: Parameters<typeof navFor>[0]) => navFor(a).tabs.map((t) => t.href);
  it("follows whether the student is in a season", () => {
    expect(hrefs({ role: "STUDENT", graduationYear: null, activeSeasonId: 1 })).toEqual([
      "/dashboard", "/calendar", "/work", "/submitted", "/more",
    ]);
    expect(hrefs({ role: "STUDENT", graduationYear: null, activeSeasonId: null })).toEqual([
      "/dashboard", "/calendar", "/history", "/more",
    ]);
    expect(hrefs({ role: "STUDENT", graduationYear: 2024, activeSeasonId: null })).toEqual([
      "/dashboard", "/calendar", "/history", "/profile", "/more",
    ]);
  });
  it("STUDENT_BETWEEN sidebar has no season, work or attendance", () => {
    expect(STUDENT_BETWEEN.sidebar.map((i) => i.label)).toEqual([
      "Dashboard", "Calendar", "History", "Profile", "Notifications", "Profile settings",
      "Notification settings",
    ]);
  });
});

describe("isAlumnus", () => {
  it("is a graduated student only: navFor's ALUMNI rule", () => {
    expect(isAlumnus({ role: "STUDENT", graduationYear: 2025 })).toBe(true);
    expect(isAlumnus({ role: "STUDENT", graduationYear: null })).toBe(false);
    expect(isAlumnus({ role: "LEADER", graduationYear: 2025 })).toBe(false);
  });
});

describe("isStudyingAlumnus (community-wide seasons)", () => {
  const studying = { role: "STUDENT" as const, graduationYear: 2025, activeSeasonId: 7 };

  it("is an alumnus with an active season, and nobody else", () => {
    expect(isStudyingAlumnus(studying)).toBe(true);
    expect(isStudyingAlumnus({ ...studying, activeSeasonId: null })).toBe(false);
    expect(isStudyingAlumnus({ ...studying, graduationYear: null })).toBe(false);
    expect(isStudyingAlumnus({ ...studying, role: "LEADER" })).toBe(false);
  });

  it("gets the student nav, and stays an alumnus", () => {
    expect(navFor(studying)).toBe(navByRole.STUDENT);
    expect(isAlumnus(studying)).toBe(true);
  });

  it("gets the alumni nav back once the season is over", () => {
    expect(navFor({ ...studying, activeSeasonId: null }).tabs.map((t) => t.label)).toEqual([
      "Today", "Events", "History", "Profile", "More",
    ]);
  });
});
