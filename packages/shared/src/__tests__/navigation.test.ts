import { navByRole, navFor } from "../navigation";

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
    for (const [role, nav] of Object.entries(navByRole)) {
      expect(nav.tabs).toHaveLength(5);
      expect(nav.tabs[2]?.label).toBe("Home");
      expect(nav.sidebar.length).toBeGreaterThan(0);
      expect(role).toEqual(expect.any(String));
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
});
