import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { config } from "../../lib/config";
import { newPublicId } from "../../lib/public-id";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

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
// checkInToken is @unique on Session; generating it rather than hard-coding
// a literal avoids a collision with a leftover row from an interrupted
// previous run.
let checkInToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;

  const superUser = await createTestUser("super", "SUPER");
  const adminUser = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");
  studentUserId = student.id;

  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  checkInToken = newPublicId();
  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      description: "A test session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      location: "Hall",
      checkInToken,
    },
    select: { id: true },
  });
  sessionId = session.id;

  superToken = await login(app, superUser.email);
  adminToken = await login(app, adminUser.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
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

  it("returns 403 for a user with no access to the season", async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", `Bearer ${outsiderToken}`);
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

describe("POST /api/v1/sessions", () => {
  it("creates a weekly series sharing one recurrence id, one calendar week apart", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Weekly session", startsAt: "2099-03-01T18:00:00.000Z",
        durationMinutes: 90, repeatWeeks: 3,
      });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.recurrenceGroupId).toBe("string");
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, seasonId: true },
    });
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-03-01T18:00:00.000Z", "2099-03-08T18:00:00.000Z", "2099-03-15T18:00:00.000Z",
    ]);
    expect(rows.every((r) => r.seasonId === seasonId)).toBe(true);
    expect(res.body.data.id).toBe(rows[0]?.id);
  });

  it("keeps the org wall-clock time across a DST change (C2, X13)", async () => {
    // Precondition, stated so a non-default .env fails readably.
    expect(config.orgTimezone).toBe("Africa/Cairo");
    // Cairo moves UTC+2 → UTC+3 on 2099-04-24. v1's host-zone addDays would
    // keep the UTC instant on a UTC server and drift the class to 21:00.
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({
        seasonId, title: "Spring series", startsAt: "2099-04-17T18:00:00.000Z",
        durationMinutes: 60, repeatWeeks: 3,
      });

    expect(res.status).toBe(201);
    const rows = await db.session.findMany({
      where: { recurrenceGroupId: res.body.data.recurrenceGroupId },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    expect(rows.map((r) => r.startsAt.toISOString())).toEqual([
      "2099-04-17T18:00:00.000Z", "2099-04-24T17:00:00.000Z", "2099-05-01T17:00:00.000Z",
    ]);
  });

  it("creates a single session with a null recurrence id", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${adminToken}`)
      .send({ seasonId, title: "One-off", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(201);
    expect(res.body.data.recurrenceGroupId).toBeNull();
  });

  it("refuses a non-admin of the season", async () => {
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${studentToken}`)
      .send({ seasonId, title: "Nope", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(403);
  });

  it("404s a soft-deleted season (v1 never checked)", async () => {
    const dead = await createTestSeason();
    await db.season.update({ where: { id: dead.id }, data: { deletedAt: new Date() } });
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer ${superToken}`)
      .send({ seasonId: dead.id, title: "Ghost", startsAt: "2099-04-01T18:00:00.000Z", durationMinutes: 60 });
    expect(res.status).toBe(404);
  });
});
