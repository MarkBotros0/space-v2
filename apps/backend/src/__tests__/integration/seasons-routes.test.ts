import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
} from "./fixtures";

jest.setTimeout(30000);

const app = createApp();

let seasonId: number;
let otherSeasonId: number;
let superToken: string;
let adminToken: string;
let studentToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  const other = await createTestSeason();
  otherSeasonId = other.id;

  const superUser = await createTestUser("super", "SUPER");
  const adminUser = await createTestUser("admin", "ADMIN");
  const student = await createTestUser("student", "STUDENT");
  const outsider = await createTestUser("outsider", "STUDENT");

  // Admin is scoped to `seasonId` only — the token must not open otherSeasonId.
  await db.seasonAdmin.create({ data: { seasonId, userId: adminUser.id } });

  // Student is enrolled in `seasonId`. The outsider is enrolled nowhere.
  await db.seasonEnrollment.create({
    data: { seasonId, studentUserId: student.id, status: "ACTIVE" },
  });

  await db.group.create({
    data: {
      seasonId,
      name: "Test Group A",
      students: { create: { studentUserId: student.id } },
    },
  });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, adminUser.email);
  studentToken = await login(app, student.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/seasons", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/seasons");
    expect(res.status).toBe(401);
  });

  it("returns both test seasons for a SUPER", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([seasonId, otherSeasonId]));
  });

  it("returns only the scoped season for an ADMIN", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });

  it("returns only the enrolled season for a STUDENT", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });

  it("returns no test seasons for an unenrolled STUDENT", async () => {
    const res = await request(app).get("/api/v1/seasons").set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.seasons.map((s: { id: number }) => s.id);
    expect(ids).not.toContain(seasonId);
    expect(ids).not.toContain(otherSeasonId);
  });
});

describe("GET /api/v1/seasons/:id", () => {
  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/v1/seasons/abc").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns the season with counts and groups for a SUPER", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(seasonId);
    expect(res.body.data.program).toBe("TEST");
    expect(res.body.data.studentCount).toBe(1);
    expect(res.body.data.sessionCount).toBe(0);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0]).toEqual({
      id: expect.any(Number),
      name: "Test Group A",
      studentCount: 1,
      leaderNames: [],
    });
  });

  it("returns 403 for a student not enrolled in the season", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 403 when an ADMIN reaches outside their season scope", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a season id that does not exist", async () => {
    const res = await request(app)
      .get("/api/v1/seasons/2147483000")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("shows a student only their own group", async () => {
    // A second group the student does not belong to must not appear.
    await db.group.create({ data: { seasonId, name: "Test Group B" } });

    const res = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].name).toBe("Test Group A");
  });
});
