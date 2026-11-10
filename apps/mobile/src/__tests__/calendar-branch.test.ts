import { calendarBranchFor } from "../lib/calendar-branch";

const who = (role: "SUPER" | "ADMIN" | "LEADER" | "MENTOR" | "STUDENT", over = {}) => ({
  role,
  graduationYear: null,
  activeSeasonId: 7,
  ...over,
});

describe("calendarBranchFor", () => {
  it("gives each staff role its own calendar, and a mentor none", () => {
    expect(calendarBranchFor(who("SUPER"), [])).toBe("SUPER");
    expect(calendarBranchFor(who("ADMIN"), [])).toBe("ADMIN");
    expect(calendarBranchFor(who("LEADER"), [3])).toBe("LEADER");
    expect(calendarBranchFor(who("MENTOR"), [])).toBe("UNAVAILABLE");
  });

  it("tells a leader who leads no group so", () => {
    expect(calendarBranchFor(who("LEADER"), [])).toBe("LEADS_NOTHING");
  });

  it("gives an alumnus the alumni calendar unless they are studying", () => {
    expect(calendarBranchFor(who("STUDENT", { graduationYear: 2024, activeSeasonId: null }), [])).toBe("ALUMNI");
    expect(calendarBranchFor(who("STUDENT", { graduationYear: 2024 }), [])).toBe("STUDENT");
    expect(calendarBranchFor(who("STUDENT"), [])).toBe("STUDENT");
    expect(calendarBranchFor(null, [])).toBe("STUDENT");
  });
});
