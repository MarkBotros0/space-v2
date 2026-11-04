// GET /students/:id/engagement with the database mocked: no in-scope season
// is no_season (the card hides) unless the caller named a season, and the
// cohort query never scores a soft-deleted student.

const mockDb = {
  seasonEnrollment: { findMany: jest.fn() },
  session: { findMany: jest.fn() },
  attendance: { findMany: jest.fn() },
  assignment: { findMany: jest.fn() },
  submission: { findMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

const mockStaffScope = jest.fn();
jest.mock("../lib/permissions", () => ({
  canAccessSeason: jest.fn(),
  canViewStudent: jest.fn().mockResolvedValue(true),
  staffScopeForSeason: (...a: unknown[]) => mockStaffScope(...a),
}));

const mockVerify = jest.fn();
jest.mock("../lib/auth/tokens", () => ({ verifyAccessToken: (t: string) => mockVerify(t) }));

import express from "express";
import request from "supertest";

import { computeEngagementForSeason } from "../lib/queries/engagement";
import { studentEngagementRouter } from "../routes/engagement";

const app = express().use("/students", studentEngagementRouter);

const leader = {
  userId: 1, role: "LEADER", seasonAdminIds: [], groupLeaderIds: [3],
  activeSeasonId: null, graduationYear: null,
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
  const res = await request(app)
    .get("/students/11/engagement?seasonId=8")
    .set("authorization", "Bearer x");
  expect(res.status).toBe(403);
});

it("scores live students only", async () => {
  mockDb.seasonEnrollment.findMany.mockResolvedValue([]);
  await computeEngagementForSeason(8);
  expect(mockDb.seasonEnrollment.findMany.mock.calls[0][0].where).toEqual(
    expect.objectContaining({ studentUser: { deletedAt: null }, status: "ACTIVE" }),
  );
});
