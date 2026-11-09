// GET /groups/:id with the database mocked: members come from
// SeasonEnrollment.groupId (ruling C9), ACTIVE and COMPLETED, live students
// only — never the GroupStudent table.

const mockDb = {
  group: { findUnique: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
// requireAuth's Plan 18 M13 check reads User.sessionsValidFrom; no session
// has been invalidated in this suite.
jest.mock("../lib/auth/session-validity", () => ({ isAccessTokenInvalidated: async () => false }));
jest.mock("../lib/permissions", () => ({ canAccessGroup: jest.fn().mockResolvedValue(true) }));

const mockVerify = jest.fn();
jest.mock("../lib/auth/tokens", () => ({ verifyAccessToken: (t: string) => mockVerify(t) }));

import express from "express";
import request from "supertest";

import { seasonParticipant } from "../lib/queries/season-participants";
import { groupsRouter } from "../routes/groups";

const app = express().use(express.json()).use("/groups", groupsRouter);

const admin = {
  userId: 1,
  role: "ADMIN",
  seasonAdminIds: [7],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null,
};

beforeEach(() => {
  mockVerify.mockResolvedValue(admin);
  mockDb.group.findUnique.mockReset();
});

it("selects members from enrolments with the member statuses and live students", async () => {
  mockDb.group.findUnique.mockResolvedValue({
    id: 3,
    name: "Tuesday",
    description: null,
    seasonId: 7,
    season: { code: "s7", title: "S7" },
    leaders: [],
    seasonEnrollments: [
      { seasonId: 7, studentUser: { id: 11, name: "A", email: "a@jpc.test" } },
      // An enrolment of another season pointing at this group is not a member.
      { seasonId: 8, studentUser: { id: 12, name: "B", email: "b@jpc.test" } },
    ],
  });

  const res = await request(app).get("/groups/3").set("authorization", "Bearer x");

  expect(res.status).toBe(200);
  expect(res.body.data.students).toEqual([{ id: 11, name: "A", email: "a@jpc.test" }]);
  const select = mockDb.group.findUnique.mock.calls[0][0].select;
  expect(select.students).toBeUndefined();
  expect(select.seasonEnrollments.where).toEqual({
    ...seasonParticipant,
    studentUser: { deletedAt: null },
  });
});
