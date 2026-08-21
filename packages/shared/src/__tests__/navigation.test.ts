import { navByRole, navFor } from "../navigation";
import type { RoleNav } from "../navigation";

const base = { role: "STUDENT" as const, graduationYear: null as number | null };

describe("navFor", () => {
  it("returns the alumni nav for a graduated student", () => {
    const nav = navFor({ role: "STUDENT", graduationYear: 2024 });
    expect(nav.tabs.map((t) => t.label)).toEqual([
      "Events",
      "History",
      "Home",
      "Profile",
      "More",
    ]);
  });

  it("returns the student nav for an active student", () => {
    const nav = navFor(base);
    expect(nav).toBe(navByRole.STUDENT);
  });

  it("ignores graduationYear for non-students", () => {
    // Only a STUDENT can be an alumnus. A LEADER with a graduation year is a
    // graduate who now leads — they get the leader app.
    expect(navFor({ role: "LEADER", graduationYear: 2024 })).toBe(navByRole.LEADER);
  });

  it("gives every role exactly five tabs with Home in the middle", () => {
    for (const nav of Object.values(navByRole)) {
      expect(nav.tabs).toHaveLength(5);
      expect(nav.tabs[2]?.label).toBe("Home");
      expect(nav.sidebar.length).toBeGreaterThan(0);
    }
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
        ["/users", "Users", "users"],
        ["/reports", "Reports", "reports"],
        ["/settings", "Settings", "settings"],
      ],
      tabs: [
        ["/seasons", "Seasons", "season"],
        ["/calendar", "Calendar", "calendar"],
        ["/dashboard", "Home", "home"],
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
        ["/assignments", "Assignments", "assignments"],
        ["/quizzes", "Quizzes", "quizzes"],
        ["/reports", "Reports", "reports"],
        ["/settings", "Settings", "settings"],
      ],
      tabs: [
        ["/calendar", "Calendar", "calendar"],
        ["/groups", "Groups", "groups"],
        ["/dashboard", "Home", "home"],
        ["/students", "Students", "students"],
        ["/more", "More", "more"],
      ],
    });

    expect(shape(navByRole.LEADER)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/groups", "My Groups", "groups"],
        ["/calendar", "Calendar", "calendar"],
        ["/submissions", "Submissions", "submissions"],
        ["/quizzes", "Quizzes", "quizzes"],
        ["/settings", "Settings", "settings"],
      ],
      tabs: [
        ["/groups", "My Group", "groups"],
        ["/calendar", "Calendar", "calendar"],
        ["/dashboard", "Home", "home"],
        ["/submissions", "Submissions", "submissions"],
        ["/more", "More", "more"],
      ],
    });

    expect(shape(navByRole.STUDENT)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/season", "Current Season", "season"],
        ["/calendar", "Calendar", "calendar"],
        ["/assignments", "Assignments", "assignments"],
        ["/quizzes", "Quizzes", "quizzes"],
        ["/history", "History", "history"],
        ["/profile", "Profile", "profile"],
        ["/settings", "Settings", "settings"],
      ],
      tabs: [
        ["/calendar", "Calendar", "calendar"],
        ["/assignments", "Assignments", "assignments"],
        ["/dashboard", "Home", "home"],
        ["/quizzes", "Quizzes", "quizzes"],
        ["/more", "More", "more"],
      ],
    });

    expect(shape(navByRole.MENTOR)).toEqual({
      sidebar: [
        ["/dashboard", "Dashboard", "dashboard"],
        ["/students", "Students", "students"],
        ["/reports", "Reports", "reports"],
        ["/settings", "Settings", "settings"],
      ],
      tabs: [
        ["/students", "Students", "students"],
        ["/reports", "Reports", "reports"],
        ["/dashboard", "Home", "home"],
        ["/notes", "Notes", "notes"],
        ["/profile", "Profile", "profile"],
      ],
    });

    const alumni = navFor({ role: "STUDENT", graduationYear: 2024 });
    expect(shape(alumni)).toEqual({
      sidebar: [
        ["/dashboard", "Home", "dashboard"],
        ["/calendar", "Events", "events"],
        ["/history", "My History", "history"],
        ["/profile", "Profile", "profile"],
        ["/settings", "Settings", "settings"],
      ],
      tabs: [
        ["/calendar", "Events", "events"],
        ["/history", "History", "history"],
        ["/dashboard", "Home", "home"],
        ["/profile", "Profile", "profile"],
        ["/more", "More", "more"],
      ],
    });
  });
});
