import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestSeason,
  createTestUser,
  login,
  TEST_PREFIX,
  testSeasonCode,
} from "./fixtures";

// 60s, not the Jest default: the shared Neon staging database autosuspends, so
// the first query after idle costs ~18s and this suite's beforeAll performs
// several sequential writes.
jest.setTimeout(60000);

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

const seasonBody = (code: string) => ({
  code, program: "TEST", year: 2099, status: "DRAFT",
  startDate: "2099-01-01T00:00:00.000Z", endDate: "2099-12-31T00:00:00.000Z",
});

describe("season writes", () => {
  it("fixture codes fit v1's 40-char bound with room for '-<year>'", () => {
    expect(testSeasonCode().length).toBeLessThanOrEqual(35);
  });

  it("creates a season with slugged code, derived title, and the budget fields kept", async () => {
    const code = testSeasonCode();
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...seasonBody(code.toUpperCase()), absenceBudgetMinutes: 240, absenceWeightMinutes: 120 });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe(code); // slugified back to lowercase
    const row = await db.season.findUnique({
      where: { id: res.body.data.id },
      select: { title: true, absenceBudgetMinutes: true, absenceWeightMinutes: true, createdById: true },
    });
    // v1 derived title as `${program} ${year}` and its create DISCARDED the
    // budget fields (spec 02 D1) — both behaviours pinned here.
    expect(row).toMatchObject({ title: "TEST 2099", absenceBudgetMinutes: 240, absenceWeightMinutes: 120 });
    expect(row?.createdById).not.toBeNull();
  });

  it("refuses creation by an ADMIN — SUPER only (spec 02 D3)", async () => {
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${adminToken}`)
      .send(seasonBody(testSeasonCode()));
    expect(res.status).toBe(403);
  });

  it("refuses an invalid code with 400", async () => {
    const res = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send(seasonBody(`${TEST_PREFIX}${"x".repeat(30)}`));
    expect(res.status).toBe(400);
  });

  it("lets a season ADMIN edit operational fields but not identity", async () => {
    // D3's allowlist: an admin runs the season, so the engagement knobs and
    // description are theirs; code/status/dates/program/year are SUPER's.
    const ok = await request(app)
      .patch(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ description: "Updated.", absenceBudgetMinutes: 200 });
    expect(ok.status).toBe(200);
    const row = await db.season.findUnique({
      where: { id: seasonId }, select: { description: true, absenceBudgetMinutes: true },
    });
    expect(row).toEqual({ description: "Updated.", absenceBudgetMinutes: 200 });

    const refused = await request(app)
      .patch(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ status: "ARCHIVED" });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("forbidden_field");
  });

  it("refuses PATCH by an ADMIN of a different season", async () => {
    const res = await request(app)
      .patch(`/api/v1/seasons/${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ description: "Nope." });
    expect(res.status).toBe(403);
  });

  it("lets a SUPER rewrite identity, re-deriving the title", async () => {
    const created = await createTestSeason();
    const res = await request(app)
      .patch(`/api/v1/seasons/${created.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ ...seasonBody(created.code), program: "GBV", year: 2098, status: "ACTIVE" });
    expect(res.status).toBe(200);
    const row = await db.season.findUnique({ where: { id: created.id }, select: { title: true, status: true } });
    expect(row).toEqual({ title: "GBV 2098", status: "ACTIVE" });
  });

  it("refuses a duplicate code with 409, not a Prisma error", async () => {
    const first = testSeasonCode();
    const made = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send(seasonBody(first));
    expect(made.status).toBe(201);
    const clash = await request(app)
      .post("/api/v1/seasons")
      .set("authorization", `Bearer ${superToken}`)
      .send(seasonBody(first));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("code_taken");
  });

  it("soft-deletes an empty season and clears student pointers to it", async () => {
    const empty = await createTestSeason();
    const pointed = await createTestUser("pointed", "STUDENT");
    await db.studentProfile.create({ data: { userId: pointed.id, activeSeasonId: empty.id } });

    const gone = await request(app)
      .delete(`/api/v1/seasons/${empty.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(gone.status).toBe(200);
    const row = await db.season.findUnique({ where: { id: empty.id }, select: { deletedAt: true } });
    expect(row?.deletedAt).not.toBeNull();
    const profile = await db.studentProfile.findUnique({
      where: { userId: pointed.id }, select: { activeSeasonId: true },
    });
    expect(profile?.activeSeasonId).toBeNull();

    const again = await request(app)
      .delete(`/api/v1/seasons/${empty.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(again.status).toBe(404);
  });

  it("blocks deleting a season with enrollments or sessions (decision on spec 02 D4)", async () => {
    // `seasonId` (the suite's main season) has an enrollment from beforeAll.
    const blocked = await request(app)
      .delete(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("season_in_use");

    const withSession = await createTestSeason();
    await db.session.create({
      data: { seasonId: withSession.id, title: "S", startsAt: new Date("2099-02-01T18:00:00.000Z"), durationMinutes: 60 },
    });
    const blocked2 = await request(app)
      .delete(`/api/v1/seasons/${withSession.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(blocked2.status).toBe(409);
  });

  it("refuses delete by an ADMIN even of their own season (D3)", async () => {
    const res = await request(app)
      .delete(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});
