import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let sessionId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;
let studentUserId: number;

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

  const session = await db.session.create({
    data: {
      seasonId,
      title: "Session One",
      description: "A test session",
      startsAt: new Date("2099-03-01T18:00:00.000Z"),
      durationMinutes: 90,
      location: "Hall",
      checkInToken: "test-check-in-token",
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
      checkInToken: "test-check-in-token",
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
    expect(JSON.stringify(res.body)).not.toContain("test-check-in-token");
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
    expect(JSON.stringify(res.body)).not.toContain("test-check-in-token");
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
