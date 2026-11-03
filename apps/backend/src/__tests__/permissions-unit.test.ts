const mockDb = {
  group: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn() },
  session: { findUnique: jest.fn() },
  submission: { findUnique: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

import type { SessionUser } from "../lib/auth/tokens";
import {
  attendanceScopeFor,
  canAccessGroup,
  canAccessSeason,
  canManageAssignment,
  canMarkAttendance,
  canReviewSubmission,
  canViewSubmission,
  staffScopeForSeason,
} from "../lib/permissions";

function user(over: Partial<SessionUser>): SessionUser {
  return {
    userId: 10, role: "STUDENT", seasonAdminIds: [], groupLeaderIds: [],
    activeSeasonId: null, graduationYear: null, ...over,
  };
}

beforeEach(() => jest.resetAllMocks());

describe("canAccessSeason", () => {
  it("lets SUPER, MENTOR and the season's ADMIN in without a query", async () => {
    expect(await canAccessSeason(user({ role: "SUPER" }), 1)).toBe(true);
    expect(await canAccessSeason(user({ role: "MENTOR" }), 1)).toBe(true);
    expect(await canAccessSeason(user({ role: "ADMIN", seasonAdminIds: [1] }), 1)).toBe(true);
    expect(mockDb.group.findFirst).not.toHaveBeenCalled();
  });

  it("denies an ADMIN of a different season", async () => {
    expect(await canAccessSeason(user({ role: "ADMIN", seasonAdminIds: [2] }), 1)).toBe(false);
  });

  it("lets a LEADER in only if one of their groups is in that season", async () => {
    const leader = user({ role: "LEADER", groupLeaderIds: [5] });
    mockDb.group.findFirst.mockResolvedValueOnce({ id: 5 });
    expect(await canAccessSeason(leader, 1)).toBe(true);
    mockDb.group.findFirst.mockResolvedValueOnce(null);
    expect(await canAccessSeason(leader, 1)).toBe(false);
  });

  it("denies a LEADER with no groups without querying", async () => {
    expect(await canAccessSeason(user({ role: "LEADER" }), 1)).toBe(false);
    expect(mockDb.group.findFirst).not.toHaveBeenCalled();
  });

  it("lets a STUDENT in via the active season or an enrolment", async () => {
    expect(await canAccessSeason(user({ activeSeasonId: 1 }), 1)).toBe(true);
    expect(mockDb.seasonEnrollment.findUnique).not.toHaveBeenCalled();
    mockDb.seasonEnrollment.findUnique.mockResolvedValueOnce({ id: 1 });
    expect(await canAccessSeason(user({ activeSeasonId: 2 }), 1)).toBe(true);
    mockDb.seasonEnrollment.findUnique.mockResolvedValueOnce(null);
    expect(await canAccessSeason(user({ activeSeasonId: 2 }), 1)).toBe(false);
  });
});

describe("canAccessGroup", () => {
  it("lets SUPER, MENTOR and the group's own leader in without a query", async () => {
    expect(await canAccessGroup(user({ role: "SUPER" }), 5)).toBe(true);
    expect(await canAccessGroup(user({ role: "MENTOR" }), 5)).toBe(true);
    expect(await canAccessGroup(user({ role: "LEADER", groupLeaderIds: [5] }), 5)).toBe(true);
    expect(mockDb.group.findUnique).not.toHaveBeenCalled();
  });

  it("denies when the group doesn't exist", async () => {
    mockDb.group.findUnique.mockResolvedValue(null);
    expect(await canAccessGroup(user({ role: "ADMIN", seasonAdminIds: [1] }), 5)).toBe(false);
  });

  it("lets the season ADMIN in and denies another season's ADMIN", async () => {
    mockDb.group.findUnique.mockResolvedValue({ seasonId: 1 });
    expect(await canAccessGroup(user({ role: "ADMIN", seasonAdminIds: [1] }), 5)).toBe(true);
    expect(await canAccessGroup(user({ role: "ADMIN", seasonAdminIds: [2] }), 5)).toBe(false);
  });

  it("lets a STUDENT in only for their own group in that group's season", async () => {
    mockDb.group.findUnique.mockResolvedValue({ seasonId: 1 });
    mockDb.seasonEnrollment.findUnique.mockResolvedValueOnce({ groupId: 5 });
    expect(await canAccessGroup(user({}), 5)).toBe(true);
    mockDb.seasonEnrollment.findUnique.mockResolvedValueOnce({ groupId: 6 });
    expect(await canAccessGroup(user({}), 5)).toBe(false);
    mockDb.seasonEnrollment.findUnique.mockResolvedValueOnce(null);
    expect(await canAccessGroup(user({}), 5)).toBe(false);
  });

  it("denies a non-member LEADER", async () => {
    mockDb.group.findUnique.mockResolvedValue({ seasonId: 1 });
    expect(await canAccessGroup(user({ role: "LEADER", groupLeaderIds: [9] }), 5)).toBe(false);
  });
});

describe("staffScopeForSeason / attendanceScopeFor / canMarkAttendance", () => {
  it("gives SUPER and the season ADMIN the whole season", async () => {
    expect(await staffScopeForSeason(user({ role: "SUPER" }), 1)).toEqual({ kind: "season" });
    expect(await staffScopeForSeason(user({ role: "ADMIN", seasonAdminIds: [1] }), 1)).toEqual({ kind: "season" });
  });

  it.each(["STUDENT", "MENTOR"] as const)("gives a %s no scope", async (role) => {
    expect(await staffScopeForSeason(user({ role }), 1)).toBeNull();
  });

  it("scopes a LEADER to just their groups in that season", async () => {
    mockDb.group.findMany.mockResolvedValue([{ id: 5 }]);
    expect(await staffScopeForSeason(user({ role: "LEADER", groupLeaderIds: [5, 6] }), 1)).toEqual({
      kind: "groups", seasonId: 1, groupIds: [5],
    });
  });

  it("gives a LEADER with no groups, or none in this season, no scope", async () => {
    expect(await staffScopeForSeason(user({ role: "LEADER" }), 1)).toBeNull();
    mockDb.group.findMany.mockResolvedValue([]);
    expect(await staffScopeForSeason(user({ role: "LEADER", groupLeaderIds: [6] }), 1)).toBeNull();
  });

  it("resolves a session to its season, and denies a missing session", async () => {
    mockDb.session.findUnique.mockResolvedValueOnce({ seasonId: 1 });
    expect(await attendanceScopeFor(user({ role: "ADMIN", seasonAdminIds: [1] }), 99)).toEqual({ kind: "season" });
    expect(await canMarkAttendance(user({ role: "SUPER" }), 99)).toBe(true);
    mockDb.session.findUnique.mockResolvedValueOnce(null);
    expect(await attendanceScopeFor(user({ role: "ADMIN", seasonAdminIds: [1] }), 99)).toBeNull();
    mockDb.session.findUnique.mockResolvedValueOnce(null);
    expect(await canMarkAttendance(user({ role: "ADMIN", seasonAdminIds: [1] }), 99)).toBe(false);
  });
});

describe("canManageAssignment", () => {
  it("is a season-admin power, not a leader one", () => {
    expect(canManageAssignment(user({ role: "ADMIN", seasonAdminIds: [1] }), 1)).toBe(true);
    expect(canManageAssignment(user({ role: "ADMIN", seasonAdminIds: [2] }), 1)).toBe(false);
    expect(canManageAssignment(user({ role: "LEADER", groupLeaderIds: [5] }), 1)).toBe(false);
  });
});

describe("canViewSubmission / canReviewSubmission", () => {
  const sub = { studentUserId: 20, assignment: { seasonId: 1 } };

  it("SUPER and MENTOR view without a lookup; only SUPER reviews without one", async () => {
    expect(await canViewSubmission(user({ role: "SUPER" }), 1)).toBe(true);
    expect(await canViewSubmission(user({ role: "MENTOR" }), 1)).toBe(true);
    expect(await canReviewSubmission(user({ role: "SUPER" }), 1)).toBe(true);
    expect(mockDb.submission.findUnique).not.toHaveBeenCalled();
  });

  it("denies both when the submission doesn't exist", async () => {
    mockDb.submission.findUnique.mockResolvedValue(null);
    expect(await canViewSubmission(user({ role: "ADMIN", seasonAdminIds: [1] }), 1)).toBe(false);
    expect(await canReviewSubmission(user({ role: "ADMIN", seasonAdminIds: [1] }), 1)).toBe(false);
  });

  it("lets an author view but never review their own work", async () => {
    mockDb.submission.findUnique.mockResolvedValue({ ...sub, studentUserId: 10 });
    expect(await canViewSubmission(user({}), 1)).toBe(true);
    expect(await canReviewSubmission(user({ role: "ADMIN", seasonAdminIds: [1] }), 1)).toBe(false);
  });

  it("lets the season ADMIN view and review", async () => {
    mockDb.submission.findUnique.mockResolvedValue(sub);
    const admin = user({ role: "ADMIN", seasonAdminIds: [1] });
    expect(await canViewSubmission(admin, 1)).toBe(true);
    expect(await canReviewSubmission(admin, 1)).toBe(true);
  });

  it("MENTOR and unrelated STUDENT can't review; unrelated STUDENT can't view", async () => {
    mockDb.submission.findUnique.mockResolvedValue(sub);
    expect(await canReviewSubmission(user({ role: "MENTOR" }), 1)).toBe(false);
    expect(await canViewSubmission(user({}), 1)).toBe(false);
    expect(await canReviewSubmission(user({}), 1)).toBe(false);
  });

  it("scopes a LEADER by the student's enrolment group in the assignment's season", async () => {
    mockDb.submission.findUnique.mockResolvedValue(sub);
    const leader = user({ role: "LEADER", groupLeaderIds: [5] });
    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: 5 });
    expect(await canViewSubmission(leader, 1)).toBe(true);
    expect(await canReviewSubmission(leader, 1)).toBe(true);
    expect(mockDb.seasonEnrollment.findUnique).toHaveBeenLastCalledWith({
      where: { studentUserId_seasonId: { studentUserId: 20, seasonId: 1 } },
      select: { groupId: true },
    });

    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: 6 });
    expect(await canViewSubmission(leader, 1)).toBe(false);
    expect(await canReviewSubmission(leader, 1)).toBe(false);

    mockDb.seasonEnrollment.findUnique.mockResolvedValue({ groupId: null });
    expect(await canViewSubmission(leader, 1)).toBe(false);
    mockDb.seasonEnrollment.findUnique.mockResolvedValue(null);
    expect(await canReviewSubmission(leader, 1)).toBe(false);
  });
});
