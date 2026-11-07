import { dashboardBranchFor } from "../lib/dashboard-branch";

describe("dashboardBranchFor — navFor's audience rule (spec 19 §9)", () => {
  it("maps each role to its branch, and a graduated student to ALUMNI", () => {
    expect(dashboardBranchFor({ role: "SUPER", graduationYear: null, activeSeasonId: null })).toBe("SUPER");
    expect(dashboardBranchFor({ role: "ADMIN", graduationYear: null, activeSeasonId: null })).toBe("ADMIN");
    expect(dashboardBranchFor({ role: "LEADER", graduationYear: 2020, activeSeasonId: null })).toBe("LEADER");
    expect(dashboardBranchFor({ role: "MENTOR", graduationYear: null, activeSeasonId: null })).toBe("MENTOR");
    expect(dashboardBranchFor({ role: "STUDENT", graduationYear: null, activeSeasonId: null })).toBe("STUDENT");
    expect(dashboardBranchFor({ role: "STUDENT", graduationYear: 2024, activeSeasonId: null })).toBe("ALUMNI");
  });
});
