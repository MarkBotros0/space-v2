// POST /sessions/:id/attendance with the database mocked: every scope checks
// enrolment in the session's season, and the low-attendance alert only sees
// rows whose status actually changed to ABSENT.

const mockDb = {
  session: { findUnique: jest.fn() },
  seasonEnrollment: { findMany: jest.fn() },
  attendance: { findMany: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../db/client", () => ({ db: mockDb }));

const mockScope = jest.fn();
jest.mock("../lib/permissions", () => ({ attendanceScopeFor: (...a: unknown[]) => mockScope(...a) }));

const mockFlag = jest.fn();
jest.mock("../lib/attendance-notifications", () => ({
  flagLowAttendance: (...a: unknown[]) => mockFlag(...a),
}));

const mockVerify = jest.fn();
jest.mock("../lib/auth/tokens", () => ({ verifyAccessToken: (t: string) => mockVerify(t) }));

import express from "express";
import request from "supertest";

import { requireAuth } from "../middleware/require-auth";
import { saveAttendance } from "../routes/sessions/attendance";

const app = express()
  .use(express.json())
  .post("/sessions/:id/attendance", requireAuth, saveAttendance);

const admin = {
  userId: 1, role: "ADMIN", seasonAdminIds: [7], groupLeaderIds: [],
  activeSeasonId: null, graduationYear: null,
};

const save = (entries: unknown[]) =>
  request(app).post("/sessions/5/attendance").set("authorization", "Bearer x").send({ entries });

beforeEach(() => {
  jest.resetAllMocks();
  mockVerify.mockResolvedValue(admin);
  mockScope.mockResolvedValue({ kind: "season" });
  mockDb.session.findUnique.mockResolvedValue({ seasonId: 7 });
  mockDb.attendance.findMany.mockResolvedValue([]);
  mockDb.$transaction.mockResolvedValue([]);
  mockFlag.mockResolvedValue(undefined);
});

describe("admin scope", () => {
  it("refuses a user id that is not enrolled in the session's season", async () => {
    mockDb.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 11 }]);
    const res = await save([
      { studentUserId: 11, status: "PRESENT" },
      { studentUserId: 99, status: "PRESENT" },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("not_enrolled");
    expect(mockDb.seasonEnrollment.findMany).toHaveBeenCalledWith({
      where: { seasonId: 7, studentUserId: { in: [11, 99] } },
      select: { studentUserId: true },
    });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("saves when every student is enrolled", async () => {
    mockDb.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 11 }]);
    const res = await save([{ studentUserId: 11, status: "PRESENT" }]);
    expect(res.status).toBe(200);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });
});

it("keeps the leader refusal a 403", async () => {
  mockScope.mockResolvedValue({ kind: "groups", seasonId: 7, groupIds: [3] });
  mockDb.seasonEnrollment.findMany.mockResolvedValue([]);
  const res = await save([{ studentUserId: 11, status: "PRESENT" }]);
  expect(res.status).toBe(403);
  expect(mockDb.seasonEnrollment.findMany).toHaveBeenCalledWith({
    where: { seasonId: 7, studentUserId: { in: [11] }, groupId: { in: [3] } },
    select: { studentUserId: true },
  });
});

describe("low-attendance alert", () => {
  beforeEach(() => {
    mockDb.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 11 }, { studentUserId: 12 }]);
  });

  it("passes only rows that changed to ABSENT", async () => {
    mockDb.attendance.findMany.mockResolvedValue([{ studentUserId: 11, status: "ABSENT" }]);
    await save([
      { studentUserId: 11, status: "ABSENT" },
      { studentUserId: 12, status: "ABSENT" },
    ]);
    expect(mockFlag).toHaveBeenCalledWith(5, [{ studentUserId: 12, status: "ABSENT" }]);
  });

  it("does not run at all when a re-save changes nothing", async () => {
    mockDb.attendance.findMany.mockResolvedValue([
      { studentUserId: 11, status: "ABSENT" },
      { studentUserId: 12, status: "ABSENT" },
    ]);
    await save([
      { studentUserId: 11, status: "ABSENT" },
      { studentUserId: 12, status: "ABSENT" },
    ]);
    expect(mockFlag).not.toHaveBeenCalled();
  });
});
