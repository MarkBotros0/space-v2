// GET /students/:id/engagement with the database mocked: no in-scope season
// is no_season (the card hides) unless the caller named a season, and the
// cohort query never scores a soft-deleted student.

const mockDb = {
  seasonEnrollment: { findMany: jest.fn() },
  session: { findMany: jest.fn() },
  attendance: { findMany: jest.fn() },
  assignment: { findMany: jest.fn() },
  submission: { findMany: jest.fn() },
  quiz: { findMany: jest.fn().mockResolvedValue([]) },
};
jest.mock("../db/client", () => ({ db: mockDb }));
// requireAuth's Plan 18 M13 check reads User.sessionsValidFrom; no session
// has been invalidated in this suite.
jest.mock("../lib/auth/session-validity", () => ({ isAccessTokenInvalidated: async () => false }));

const mockStaffScope = jest.fn();
jest.mock("../lib/permissions/season", () => ({ staffScopeForSeason: (...a: unknown[]) => mockStaffScope(...a) }));
// The real season picker (lib/permissions/score.ts), over the mocked scope above.
jest.mock("../lib/permissions", () => ({
  canAccessSeason: jest.fn(),
  canViewStudent: jest.fn().mockResolvedValue(true),
  pickScoredEnrollment: (...a: unknown[]) => jest.requireActual("../lib/permissions/score").pickScoredEnrollment(...a),
}));

const mockVerify = jest.fn();
jest.mock("../lib/auth/tokens", () => ({ verifyAccessToken: (t: string) => mockVerify(t) }));

import express from "express";
import request from "supertest";

import { SUBMITTED_WHERE } from "../lib/assignments/submitted";
import { computeEngagementForSeason } from "../lib/queries/engagement";
import { seasonParticipant } from "../lib/queries/season-participants";
import { studentEngagementRouter } from "../routes/engagement";

const app = express().use("/students", studentEngagementRouter);

const leader = {
  userId: 1,
  role: "LEADER",
  seasonAdminIds: [],
  groupLeaderIds: [3],
  activeSeasonId: null,
  graduationYear: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockResolvedValue(leader);
  // The leader leads group 3; the student is ACTIVE in group 4 now.
  mockStaffScope.mockResolvedValue({ kind: "groups", seasonId: 8, groupIds: [3] });
  mockDb.seasonEnrollment.findMany.mockResolvedValue([{ seasonId: 8, groupId: 4 }]);
});

it("answers no_season when no enrolment is in the caller's scope", async () => {
  const res = await request(app).get("/students/11/engagement").set("authorization", "Bearer x");
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe("no_season");
});

it("still refuses an explicitly named season outside the caller's scope", async () => {
  const res = await request(app).get("/students/11/engagement?seasonId=8").set("authorization", "Bearer x");
  expect(res.status).toBe(403);
});

it("scores live students only", async () => {
  mockDb.seasonEnrollment.findMany.mockResolvedValue([]);
  await computeEngagementForSeason(8);
  expect(mockDb.seasonEnrollment.findMany.mock.calls[0][0].where).toEqual(
    expect.objectContaining({ studentUser: { deletedAt: null }, ...seasonParticipant }),
  );
});

it("counts an assignment done once submitted, out of every assignment of the season", async () => {
  mockDb.seasonEnrollment.findMany.mockResolvedValue([
    {
      studentUserId: 11,
      seasonId: 8,
      enrolledAt: new Date("2099-01-01T00:00:00.000Z"),
      groupId: 4,
      group: { name: "G" },
      studentUser: { name: "S" },
      season: { title: "Season" },
    },
  ]);
  mockDb.session.findMany.mockResolvedValue([]);
  // Two assignments, no targeting: both are the student's.
  mockDb.assignment.findMany.mockResolvedValue([
    { id: 1, seasonId: 8 },
    { id: 2, seasonId: 8 },
  ]);
  mockDb.submission.findMany.mockResolvedValue([{ studentUserId: 11, assignmentId: 1 }]);

  const [row] = await computeEngagementForSeason(8);

  expect(mockDb.submission.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining(SUBMITTED_WHERE));
  expect(row).toMatchObject({ submissionsExpected: 2, submissionsCompleted: 1, submissionPct: 50 });
});
