import {
  canManageUsers,
  canReadAllStudents,
  isAdminOfSeason,
  isAlumnus,
  isLeaderOfGroup,
  isMentor,
  isSuper,
} from "../lib/rbac";
import type { SessionUser } from "../lib/auth/tokens";

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 1,
    role: "STUDENT",
    seasonAdminIds: [],
    groupLeaderIds: [],
    activeSeasonId: null,
    graduationYear: null,
    ...overrides,
  };
}

describe("isSuper", () => {
  it("is true only for SUPER", () => {
    expect(isSuper(user({ role: "SUPER" }))).toBe(true);
    expect(isSuper(user({ role: "ADMIN" }))).toBe(false);
    expect(isSuper(user({ role: "STUDENT" }))).toBe(false);
  });
});

describe("isAlumnus", () => {
  it("is true for a STUDENT with a graduation year", () => {
    expect(isAlumnus(user({ role: "STUDENT", graduationYear: 2024 }))).toBe(true);
  });

  it("is false for a STUDENT who has not graduated", () => {
    expect(isAlumnus(user({ role: "STUDENT", graduationYear: null }))).toBe(false);
  });

  it("is false for a non-STUDENT even with a graduation year", () => {
    expect(isAlumnus(user({ role: "LEADER", graduationYear: 2024 }))).toBe(false);
  });
});

describe("isMentor", () => {
  it("is true only for MENTOR", () => {
    expect(isMentor(user({ role: "MENTOR" }))).toBe(true);
    expect(isMentor(user({ role: "SUPER" }))).toBe(false);
  });
});

describe("isAdminOfSeason", () => {
  it("is true for SUPER regardless of scope", () => {
    expect(isAdminOfSeason(user({ role: "SUPER" }), 7)).toBe(true);
  });

  it("is true for an ADMIN scoped to that season", () => {
    expect(isAdminOfSeason(user({ role: "ADMIN", seasonAdminIds: [7, 9] }), 7)).toBe(true);
  });

  it("is false for an ADMIN scoped to a different season", () => {
    expect(isAdminOfSeason(user({ role: "ADMIN", seasonAdminIds: [9] }), 7)).toBe(false);
  });

  it("reads the claim list, not a role paired with it", () => {
    // loadScopes derives the role from these same rows, so the list is the
    // identity. A LEADER's list can only be empty; this pins the predicate.
    expect(isAdminOfSeason(user({ role: "LEADER", seasonAdminIds: [7] }), 7)).toBe(true);
    expect(isAdminOfSeason(user({ role: "STUDENT", seasonAdminIds: [7] }), 7)).toBe(true);
  });

  it("is false for a MENTOR, whatever the claim says", () => {
    expect(isAdminOfSeason(user({ role: "MENTOR", seasonAdminIds: [7] }), 7)).toBe(false);
  });
});

describe("isLeaderOfGroup", () => {
  it("requires the group scope", () => {
    expect(isLeaderOfGroup(user({ role: "LEADER", groupLeaderIds: [3] }), 3)).toBe(true);
    expect(isLeaderOfGroup(user({ role: "LEADER", groupLeaderIds: [3] }), 4)).toBe(false);
  });

  it("is true for an ADMIN who also leads that group (Review Focus 3)", () => {
    expect(isLeaderOfGroup(user({ role: "ADMIN", seasonAdminIds: [7], groupLeaderIds: [3] }), 3)).toBe(true);
  });

  it("is false for a MENTOR, whatever the claim says", () => {
    expect(isLeaderOfGroup(user({ role: "MENTOR", groupLeaderIds: [3] }), 3)).toBe(false);
  });

  it("is false for SUPER without an explicit group scope", () => {
    // Deliberate: this predicate answers "leads this specific group", which a
    // SUPER does not. Callers that mean "may act on this group" add isSuper.
    expect(isLeaderOfGroup(user({ role: "SUPER" }), 3)).toBe(false);
  });
});

describe("canReadAllStudents", () => {
  it("is true for SUPER and MENTOR only", () => {
    expect(canReadAllStudents(user({ role: "SUPER" }))).toBe(true);
    expect(canReadAllStudents(user({ role: "MENTOR" }))).toBe(true);
    expect(canReadAllStudents(user({ role: "ADMIN" }))).toBe(false);
    expect(canReadAllStudents(user({ role: "LEADER" }))).toBe(false);
  });
});

describe("canManageUsers", () => {
  it("is true for SUPER only", () => {
    expect(canManageUsers(user({ role: "SUPER" }))).toBe(true);
    expect(canManageUsers(user({ role: "ADMIN" }))).toBe(false);
  });
});
