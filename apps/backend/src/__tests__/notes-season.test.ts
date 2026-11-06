// POST /students/:id/notes with the database mocked: an ADMIN's note files
// only under a season they run, explicit or defaulted; soft-deleted students
// are not found.

const mockDb = {
  user: { findFirst: jest.fn(), findUnique: jest.fn() },
  seasonEnrollment: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  engagementNote: { create: jest.fn() },
  seasonAdmin: { findMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/permissions", () => ({
  canEditNote: jest.fn(),
  canViewStudent: jest.fn().mockResolvedValue(true),
  canWriteNote: jest.fn().mockResolvedValue(true),
  staffRosterWhere: jest.requireActual("../lib/permissions/student").staffRosterWhere,
}));
jest.mock("../lib/notifications", () => ({ createNotificationsBulk: jest.fn() }));

const mockVerify = jest.fn();
jest.mock("../lib/auth/tokens", () => ({ verifyAccessToken: (t: string) => mockVerify(t) }));

import express from "express";
import request from "supertest";

import { studentNotesRouter } from "../routes/notes";

const app = express().use(express.json()).use("/students", studentNotesRouter);

const base = { userId: 1, groupLeaderIds: [], activeSeasonId: null, graduationYear: null };
const admin = { ...base, role: "ADMIN", seasonAdminIds: [7] };
const mentor = { ...base, role: "MENTOR", seasonAdminIds: [] };

const post = (body: Record<string, unknown>) =>
  request(app)
    .post("/students/11/notes")
    .set("authorization", "Bearer x")
    .send({ body: "A note", visibility: "ADMINS", ...body });

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.user.findFirst.mockResolvedValue({ id: 11 });
  mockDb.engagementNote.create.mockResolvedValue({
    id: 1, body: "<p>A note</p>", visibility: "ADMINS", followUpFlagged: false,
    seasonId: 7, createdAt: new Date(), updatedAt: new Date(), authorUserId: 1,
    authorUser: { name: "Admin", role: "ADMIN" }, season: { title: "S7" },
  });
});

it("looks the student up among live users only", async () => {
  mockVerify.mockResolvedValue(mentor);
  mockDb.user.findFirst.mockResolvedValue(null);
  const res = await post({});
  expect(res.status).toBe(404);
  expect(mockDb.user.findFirst).toHaveBeenCalledWith({
    where: { id: 11, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
});

describe("ADMIN", () => {
  beforeEach(() => mockVerify.mockResolvedValue(admin));

  it("refuses an explicit season the admin does not run", async () => {
    const res = await post({ seasonId: 8 });
    expect(res.status).toBe(403);
    expect(mockDb.engagementNote.create).not.toHaveBeenCalled();
  });

  it("defaults to the newest ACTIVE enrolment among the admin's seasons", async () => {
    mockDb.seasonEnrollment.findMany.mockResolvedValue([
      { seasonId: 7, status: "COMPLETED" },
      { seasonId: 7, status: "ACTIVE" },
    ]);
    const res = await post({});
    expect(res.status).toBe(201);
    expect(mockDb.seasonEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentUserId: 11, seasonId: { in: [7] } } }),
    );
    expect(mockDb.seasonEnrollment.findFirst).not.toHaveBeenCalled();
    expect(mockDb.engagementNote.create.mock.calls[0][0].data.seasonId).toBe(7);
  });

  it("falls back to the newest enrolment in their seasons when none is ACTIVE", async () => {
    mockDb.seasonEnrollment.findMany.mockResolvedValue([{ seasonId: 7, status: "COMPLETED" }]);
    await post({});
    expect(mockDb.engagementNote.create.mock.calls[0][0].data.seasonId).toBe(7);
  });
});

it("keeps the latest-ACTIVE default for a MENTOR", async () => {
  mockVerify.mockResolvedValue(mentor);
  mockDb.seasonEnrollment.findFirst.mockResolvedValue({ seasonId: 9 });
  await post({});
  expect(mockDb.seasonEnrollment.findFirst).toHaveBeenCalledWith({
    where: { studentUserId: 11, status: "ACTIVE" },
    orderBy: { enrolledAt: "desc" },
    select: { seasonId: true },
  });
  expect(mockDb.engagementNote.create.mock.calls[0][0].data.seasonId).toBe(9);
});
