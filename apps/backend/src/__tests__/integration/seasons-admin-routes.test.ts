import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let seasonId: number;
let seasonCode: string;
let deletedCode: string;
let superToken: string;
let adminToken: string;
let leaderToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const season = await createTestSeason();
  seasonId = season.id;
  seasonCode = season.code;
  const other = await createTestSeason();
  const deleted = await createTestSeason();
  deletedCode = deleted.code;
  await db.season.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
  await db.season.update({ where: { id: seasonId }, data: { absenceBudgetMinutes: 240 } });

  const superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  const leader = await createTestUser("leader", "LEADER");
  const outsider = await createTestUser("outsider", "STUDENT");
  await db.seasonAdmin.create({ data: { seasonId, userId: admin.id } });
  await db.group.create({ data: { seasonId, name: "Led group", leaders: { create: { userId: leader.id } } } });
  await db.seasonEnrollment.create({ data: { seasonId: other.id, studentUserId: outsider.id, status: "ACTIVE" } });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
  leaderToken = await login(app, leader.email);
  outsiderToken = await login(app, outsider.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("seasonsRouter mounting (ruling X5)", () => {
  it("answers an unknown anonymous path under /api/v1/seasons with not_found, not 401", async () => {
    // A router-level use(requireAuth) would answer 401 before the catch-all —
    // and would do so for every router Plans 12, 15 and 17 mount on this prefix.
    const res = await request(app).get(`/api/v1/seasons/${seasonId}/space-v2-no-such-route`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("still requires auth on every real route", async () => {
    expect((await request(app).get("/api/v1/seasons")).status).toBe(401);
    expect((await request(app).get(`/api/v1/seasons/${seasonId}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/seasons/by-code/${seasonCode}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/seasons/${seasonId}/roster`)).status).toBe(401);
    expect((await request(app).put(`/api/v1/seasons/${seasonId}/group-assignments`).send({ assignments: [] })).status).toBe(401);
  });
});

describe("GET /api/v1/seasons/by-code/:code (spec 02 §7, D-16.2)", () => {
  it("resolves a code to the same detail GET /:id serves, with the D-16.3 fields", async () => {
    const res = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: seasonId,
      code: seasonCode,
      absenceBudgetMinutes: 240,
      absenceWeightMinutes: 90,
      canAdminister: true,
    });

    const byId = await request(app)
      .get(`/api/v1/seasons/${seasonId}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(byId.body.data).toEqual(res.body.data);
  });

  it("reports canAdminister per caller (C4)", async () => {
    const admin = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(admin.body.data.canAdminister).toBe(true);
    const leader = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${leaderToken}`);
    expect(leader.status).toBe(200);
    expect(leader.body.data.canAdminister).toBe(false);
  });

  it("is 403 for a caller who cannot see the season, 404 for an unknown or deleted code", async () => {
    const outsider = await request(app)
      .get(`/api/v1/seasons/by-code/${seasonCode}`)
      .set("authorization", `Bearer ${outsiderToken}`);
    expect(outsider.status).toBe(403);

    const unknown = await request(app)
      .get("/api/v1/seasons/by-code/space-v2-test-no-such-code")
      .set("authorization", `Bearer ${superToken}`);
    expect(unknown.status).toBe(404);

    const deleted = await request(app)
      .get(`/api/v1/seasons/by-code/${deletedCode}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(deleted.status).toBe(404);
  });

  it("is not shadowed by an /:id child route — a code may be any slug, even 'roster'", async () => {
    // Registered before every /:id/* route: /by-code/roster must not reach /:id/roster.
    const res = await request(app)
      .get("/api/v1/seasons/by-code/roster")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/season not found/i);
  });
});
