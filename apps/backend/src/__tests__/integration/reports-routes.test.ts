// apps/backend/src/__tests__/integration/reports-routes.test.ts
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let mySeasonId: number;
let otherSeasonId: number;
let superToken: string;
let mentorToken: string;
let adminToken: string;
let emptyAdminToken: string;
let leaderToken: string;
let studentToken: string;

beforeAll(async () => {
  await cleanupTestData();

  const mine = await createTestSeason();
  const other = await createTestSeason();
  mySeasonId = mine.id;
  otherSeasonId = other.id;

  const superUser = await createTestUser("rr-super", "SUPER");
  const mentor = await createTestUser("rr-mentor", "MENTOR");
  const admin = await createTestUser("rr-admin", "ADMIN");
  const emptyAdmin = await createTestUser("rr-admin-empty", "ADMIN");
  const leader = await createTestUser("rr-leader", "LEADER");
  const student = await createTestUser("rr-student", "STUDENT");

  await db.seasonAdmin.create({ data: { seasonId: mySeasonId, userId: admin.id } });

  const group = await db.group.create({
    data: { seasonId: mySeasonId, name: "Group A", leaders: { create: { userId: leader.id } } },
    select: { id: true },
  });
  await db.seasonEnrollment.create({
    data: { seasonId: mySeasonId, studentUserId: student.id, groupId: group.id, status: "ACTIVE" },
  });

  superToken = await login(app, superUser.email);
  mentorToken = await login(app, mentor.email);
  adminToken = await login(app, admin.email);
  emptyAdminToken = await login(app, emptyAdmin.email);
  leaderToken = await login(app, leader.email);
  studentToken = await login(app, student.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/reports/engagement — the gate", () => {
  it("401s an unauthenticated request in the JSON envelope, never a redirect (R87)", async () => {
    const res = await request(app).get("/api/v1/reports/engagement");
    // v1's export routes call getCurrentUserOrRedirect, so an unauthenticated
    // request is answered with a 307 to the login page — not a usable answer
    // for a mobile client fetching data.
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBeDefined();
  });

  it("refuses a LEADER explicitly (R109, D6 #4)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${leaderToken}`);
    // v1 excluded leaders by not having a leader route. The v2 tree is flat and
    // /reports exists as a file for every role, so the endpoint must say no.
    expect(res.status).toBe(403);
  });

  it("refuses a STUDENT explicitly (R110)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it("gives an ADMIN only their own seasons, and drops the rest silently", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement?seasonId=${mySeasonId}&seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // THE test this task exists for. v1's loadReportsData queried whatever ids
    // it was handed (R3); the route above it checked, and then ran the query on
    // the REQUEST rather than on the check's result. Here the response can only
    // contain what the intersection allowed.
    expect(res.body.data.scope.seasonIds).toEqual([mySeasonId]);
    expect(res.body.data.scope.truncated).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(`"seasonId":${otherSeasonId}`);
  });

  it("does not distinguish 'not yours' from 'does not exist'", async () => {
    const nonexistent = 2147483646;
    const a = await request(app)
      .get(`/api/v1/reports/engagement?seasonId=${otherSeasonId}`)
      .set("authorization", `Bearer ${adminToken}`);
    const b = await request(app)
      .get(`/api/v1/reports/engagement?seasonId=${nonexistent}`)
      .set("authorization", `Bearer ${adminToken}`);
    // Anything else is an existence oracle over the season table.
    expect(a.status).toBe(b.status);
    expect(a.body.data.scope).toEqual(b.body.data.scope);
  });

  it("gives an ADMIN with no seasons an empty report, not a 403", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${emptyAdminToken}`);
    // 403 would tell an admin their account is broken. R2: an empty scope
    // returns empty collections rather than throwing.
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds).toEqual([]);
    expect(res.body.data.bands).toHaveLength(4);
  });

  it("gives MENTOR every season (R45)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${mentorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds).toEqual(
      expect.arrayContaining([mySeasonId, otherSeasonId]),
    );
  });

  it("gives SUPER the engagement view v1 denied them (spec D17 — deliberate divergence)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${superToken}`);
    // v1 gates /mentor/reports to MENTOR only (R106) while its CSV route hands
    // SUPER exactly this data with no season parameter (R45). The restriction
    // was an artefact of the per-role page tree, not a policy.
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds.length).toBeGreaterThan(0);
  });

  it("rejects a malformed trendLimit rather than silently defaulting", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement?trendLimit=nope")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("never carries the cohort in the summary payload (R34)", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.body.data.rawStudents).toBeUndefined();
    expect(res.body.data.atRisk.length).toBeLessThanOrEqual(10);
    expect(res.body.data.atRiskTotal).toBeDefined();
  });
});

describe("GET /api/v1/reports/engagement/students — separately gated", () => {
  it("applies the same refusals as the summary", async () => {
    for (const token of [leaderToken, studentToken]) {
      const res = await request(app)
        .get("/api/v1/reports/engagement/students")
        .set("authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("pages, and intersects the scope exactly as the summary does", async () => {
    const res = await request(app)
      .get(`/api/v1/reports/engagement/students?seasonId=${otherSeasonId}&limit=1`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scope.seasonIds).toEqual([]);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.nextCursor).toBeNull();
  });

  it("caps limit at 200", async () => {
    const res = await request(app)
      .get("/api/v1/reports/engagement/students?limit=1000")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/reports/organisation — SUPER only", () => {
  it("admits SUPER", async () => {
    const res = await request(app)
      .get("/api/v1/reports/organisation")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalStudentsNotGraduated).toBeGreaterThanOrEqual(0);
  });

  it("refuses MENTOR, ADMIN, LEADER and STUDENT alike (R50, R107)", async () => {
    for (const token of [mentorToken, adminToken, leaderToken, studentToken]) {
      const res = await request(app)
        .get("/api/v1/reports/organisation")
        .set("authorization", `Bearer ${token}`);
      // loadSuperReports takes no arguments and covers the whole database with
      // no gate; its only protection is requireRole(["SUPER"]) on the one page
      // that calls it. That gate moves into the endpoint here.
      expect(res.status).toBe(403);
    }
  });
});
