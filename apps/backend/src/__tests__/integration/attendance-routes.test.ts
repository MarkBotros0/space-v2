import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

// Controller ruling: the brief specifies 30000, but the shared Neon staging
// database autosuspends and costs ~18s on the first query after idle. This
// suite's beforeAll performs several sequential writes, so 30000 risks
// tripping on a cold start; use 60000 instead.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let studentUserId: number;
let adminUserId: number;
let adminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const admin = await createTestUser("admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const student = await createTestUser("student", "STUDENT");
  adminUserId = admin.id;
  studentUserId = student.id;

  const group = await db.group.create({
    data: {
      seasonId,
      name: "Group A",
      leaders: { create: { userId: leader.id } },
      students: { create: { studentUserId: student.id } },
    },
    select: { id: true },
  });

  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
  });

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
    },
    select: { id: true },
  });
  sessionId = session.id;

  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/sessions/:id/attendance", () => {
  it("returns the enrolled roster for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.roster).toEqual([
      {
        studentUserId,
        name: "Test student",
        email: expect.any(String),
        groupName: "Group A",
        status: null,
        notes: null,
        lateMinutes: null,
      },
    ]);
  });

  it("allows a leader in the season", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
  });

  it("refuses a student — the roster exposes every peer's contact details", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 400 for a non-numeric session id", async () => {
    const res = await request(app)
      .get("/api/v1/sessions/abc/attendance")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/sessions/:id/attendance", () => {
  it("upserts entries and records who marked them", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [{ studentUserId, status: "LATE", notes: "Bus", lateMinutes: 12 }] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: 1 });

    const row = await db.attendance.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { status: true, notes: true, lateMinutes: true, markedById: true },
    });
    expect(row).toEqual({
      status: "LATE",
      notes: "Bus",
      lateMinutes: 12,
      markedById: adminUserId,
    });
  });

  it("clears lateMinutes when the status is not LATE", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [{ studentUserId, status: "PRESENT", lateMinutes: 30 }] });

    expect(res.status).toBe(200);
    const row = await db.attendance.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { status: true, lateMinutes: true, notes: true },
    });
    // lateMinutes was supplied but must not survive a non-LATE status, and the
    // omitted notes field must be cleared rather than left stale.
    expect(row).toEqual({ status: "PRESENT", lateMinutes: null, notes: null });
  });

  it("refuses a student", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${studentToken}`)
      .send({ entries: [{ studentUserId, status: "PRESENT" }] });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid status", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [{ studentUserId, status: "MAYBE" }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns 400 for a missing entries array", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("accepts an empty entries array as a no-op", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/attendance`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ entries: [] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ saved: 0 });
    expect(seasonId).toEqual(expect.any(Number));
  });
});
