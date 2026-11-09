// Community model, Build 3, Task 6: ending a community-wide season.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { loadScopes } from "../../lib/auth/scopes";

import { bearer, cleanupTestData, createTestSeason, createTestUser, reviewedOf, tokenFor } from "./fixtures";

jest.setTimeout(60000);
const app = createApp();

const post = (path: string, t: string, body: unknown) =>
  request(app)
    .post(`/api/v1${path}`)
    .set(bearer(t))
    .send(body as object);
const get = (path: string, t: string) => request(app).get(`/api/v1${path}`).set(bearer(t));

let seasonId: number;
let superToken: string;
let alumnus: { id: number };
let failed: { id: number };
let plain: { id: number };

beforeAll(async () => {
  await cleanupTestData();
  const s = await createTestSeason({ year: 2098 });
  seasonId = s.id;
  await db.season.update({ where: { id: seasonId }, data: { isCommunityWide: true } });
  const admin = await createTestUser("cwe-super", "SUPER");
  superToken = await tokenFor(admin.id);
  alumnus = await createTestUser("cwe-alumnus", "STUDENT");
  failed = await createTestUser("cwe-failed", "STUDENT");
  plain = await createTestUser("cwe-plain", "STUDENT");
  await db.user.update({ where: { id: alumnus.id }, data: { graduationYear: 2025 } });
  await db.user.update({ where: { id: failed.id }, data: { graduationYear: 2024 } });
  for (const u of [alumnus, failed, plain]) {
    await db.seasonEnrollment.create({ data: { seasonId, studentUserId: u.id, status: "ACTIVE" } });
  }
});
afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("ending a community-wide season", () => {
  it("shows each student's class on the end-check", async () => {
    const res = await get(`/seasons/${seasonId}/end-check`, superToken);
    expect(res.status).toBe(200);
    const byId = new Map(
      res.body.data.students.map((s: { userId: number; graduationYear: number | null }) => [
        s.userId,
        s.graduationYear,
      ]),
    );
    expect(byId.get(alumnus.id)).toBe(2025);
    expect(byId.get(plain.id)).toBeNull();
  });

  it("keeps every class, graduates nobody and sends alumni back to the alumni portal", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: alumnus.id }, select: { sessionsValidFrom: true } });
    const res = await post(`/seasons/${seasonId}/end`, superToken, {
      notPassed: [{ userId: failed.id, reason: null }],
      reviewed: await reviewedOf(seasonId),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.graduated).toBe(0);
    const users = await db.user.findMany({
      where: { id: { in: [alumnus.id, failed.id, plain.id] } },
      select: { id: true, graduationYear: true, role: true, sessionsValidFrom: true },
    });
    const of = (id: number) => users.find((u) => u.id === id)!;
    expect(of(alumnus.id).graduationYear).toBe(2025);
    expect(of(failed.id).graduationYear).toBe(2024);
    expect(of(plain.id).graduationYear).toBeNull();
    expect(of(plain.id).role).toBe("STUDENT");
    for (const u of users) expect(u.sessionsValidFrom).not.toBeNull();
    expect(of(alumnus.id).sessionsValidFrom!.getTime()).toBeGreaterThan(before.sessionsValidFrom?.getTime() ?? 0);
    const scopes = await loadScopes(alumnus.id);
    expect(scopes.activeSeasonId).toBeNull();
    expect(scopes.graduationYear).toBe(2025);
  });

  it("correcting a result graduates nobody", async () => {
    const res = await request(app)
      .patch(`/api/v1/seasons/${seasonId}/results/${plain.id}`)
      .set(bearer(superToken))
      .send({ result: "NOT_PASSED", reason: null });
    expect(res.status).toBe(200);
    const back = await request(app)
      .patch(`/api/v1/seasons/${seasonId}/results/${plain.id}`)
      .set(bearer(superToken))
      .send({ result: "PASSED", reason: null });
    expect(back.status).toBe(200);
    expect(back.body.data.graduated).toBe(false);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: plain.id }, select: { graduationYear: true } })).graduationYear,
    ).toBeNull();
  });
});
