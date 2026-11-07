import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";
import { seedSessionFixtures } from "./sessions-setup";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;
let studentUserId: number;
let checkInToken: string;

beforeAll(async () => {
  ({ seasonId, sessionId, superToken, adminToken, studentToken, outsiderToken, studentUserId, checkInToken } = await seedSessionFixtures(app));
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons/:id/sessions", () => {
  it("includes the check-in token for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0]).toMatchObject({
      id: sessionId,
      title: "Session One",
      durationMinutes: 90,
      location: "Hall",
      attendanceMarked: false,
      seasonId,
      checkInToken,
    });
  });

  it("withholds the check-in token from a student", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toHaveLength(1);
    expect(res.body.data.sessions[0].checkInToken).toBeNull();
    // Belt and braces: the value must not appear anywhere in the payload.
    expect(JSON.stringify(res.body)).not.toContain(checkInToken);
  });

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("keys each session to its org-calendar day (ruling X13)", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}/sessions`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // The fixture session starts 2099-03-01T18:00Z — 20:00 in Cairo.
    expect(res.body.data.sessions[0].dayKey).toBe("2099-03-01");
  });
});

describe("GET /api/v1/sessions/:id", () => {
  it("returns detail with canMarkAttendance true for a season admin", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: sessionId,
      title: "Session One",
      description: "A test session",
      durationMinutes: 90,
      location: "Hall",
      seasonId,
      checkInOpen: false,
      myAttendance: null,
      canMarkAttendance: true,
    });
    expect(res.body.data).not.toHaveProperty("checkInToken");
    expect(JSON.stringify(res.body)).not.toContain(checkInToken);
  });

  it("returns canMarkAttendance false and myAttendance for a student", async () => {
    await db.attendance.create({
      data: { sessionId, studentUserId, status: "PRESENT", markedById: studentUserId },
    });

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.canMarkAttendance).toBe(false);
    expect(res.body.data.myAttendance).toMatchObject({
      status: "PRESENT",
      notes: null,
      lateMinutes: null,
    });
  });

  it("returns 404 for a student with no enrolment (REG-77, v1 behaviour)", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a student whose enrolment is not ACTIVE (REG-77)", async () => {
    const dropped = await createTestUser("dropped", "STUDENT");
    await db.seasonEnrollment.create({
      data: { seasonId, studentUserId: dropped.id, status: "WITHDRAWN" },
    });
    const droppedToken = await login(app, dropped.email);
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${droppedToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns 403 for a non-student with no access to the season", async () => {
    const stranger = await createTestUser("stranger-admin", "STUDENT");
    const elsewhere = await createTestSeason();
    await db.seasonAdmin.create({ data: { seasonId: elsewhere.id, userId: stranger.id } });
    const strangerToken = await login(app, stranger.email);
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-numeric id and 404 for a missing one", async () => {
    const bad = await request(app)
      .get("/api/v1/sessions/abc")
      .set("authorization", `Bearer ${superToken}`);
    expect(bad.status).toBe(400);

    const missing = await request(app)
      .get("/api/v1/sessions/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);
  });
});

describe("canManageCheckIn on GET /api/v1/sessions/:id (Plan 4)", () => {
  let leaderToken: string;

  beforeAll(async () => {
    // groupLeaderIds is a token claim loaded at login, so the group must
    // exist before this login.
    const leader = await createTestUser("checkin-leader", "LEADER");
    await db.group.create({
      data: { seasonId, name: "Leader's group", leaders: { create: { userId: leader.id } } },
    });
    leaderToken = await login(app, leader.email);
  });

  it("is true for a season admin — the same gate check-in-open enforces", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ canMarkAttendance: true, canManageCheckIn: true });
  });

  it("is false for a group leader, who can still mark attendance", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ canMarkAttendance: true, canManageCheckIn: false });
  });

  it("agrees with the write gate: the leader's open is refused", async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/check-in-open`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(res.status).toBe(403);
  });

  it("is false for a student", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.canManageCheckIn).toBe(false);
  });
});
