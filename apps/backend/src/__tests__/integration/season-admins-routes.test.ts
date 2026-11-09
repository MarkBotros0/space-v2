import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestSeason, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

/**
 * SUPER-only season admin management against a real database. Everything it
 * creates (a season, test users, the SeasonAdmin row) carries the fixtures'
 * "space-v2-test-" prefix and is removed by cleanupTestData in afterAll —
 * which runs even when a test fails. No real user is ever touched.
 */
const app = createApp();

let seasonId: number;
let seasonCode: string;
let superToken: string;
let adminToken: string;
let leaderToken: string;
let targetId: number;
let targetEmail: string;
let leaderId: number;

const path = (suffix = "") => `/api/v1/seasons/${seasonId}/admins${suffix}`;
const as = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  await cleanupTestData();
  const season = await createTestSeason();
  seasonId = season.id;
  seasonCode = season.code;

  const superUser = await createTestUser("sa-super", "SUPER");
  const callerAdmin = await createTestUser("sa-caller-admin", "ADMIN");
  const leader = await createTestUser("sa-leader", "LEADER");
  const target = await createTestUser("sa-target", "STUDENT");
  await db.user.update({ where: { id: target.id }, data: { graduationYear: 2020 } });
  targetId = target.id;
  targetEmail = target.email;
  leaderId = leader.id;
  // The caller is a real season admin: still 403, the routes are SUPER-only.
  await db.seasonAdmin.create({ data: { seasonId, userId: callerAdmin.id } });

  superToken = await login(app, superUser.email);
  adminToken = await login(app, callerAdmin.email);
  leaderToken = await login(app, leader.email);
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("season admin routes", () => {
  it("answer 403 to a season admin and to a leader on all three routes", async () => {
    for (const token of [adminToken, leaderToken]) {
      expect((await request(app).get(path()).set(as(token))).status).toBe(403);
      expect((await request(app).post(path()).set(as(token)).send({ userId: targetId })).status).toBe(403);
      expect(
        (
          await request(app)
            .delete(path(`/${targetId}`))
            .set(as(token))
        ).status,
      ).toBe(403);
    }
    expect(await db.seasonAdmin.count({ where: { seasonId, userId: targetId } })).toBe(0);
  });

  it("refuses someone who hasn't graduated, writing nothing", async () => {
    const res = await request(app).post(path()).set(as(superToken)).send({ userId: leaderId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("not_alumnus");
    expect(await db.seasonAdmin.count({ where: { seasonId, userId: leaderId } })).toBe(0);
  });

  it("adds an admin (201), keeps their refresh tokens, and is idempotent (200)", async () => {
    const targetToken = await login(app, targetEmail);
    expect(targetToken).toBeTruthy();
    expect(await db.refreshToken.count({ where: { userId: targetId, revokedAt: null } })).toBeGreaterThan(0);

    const first = await request(app).post(path()).set(as(superToken)).send({ userId: targetId });
    expect(first.status).toBe(201);
    expect(first.body.data.admins.map((a: { userId: number }) => a.userId)).toContain(targetId);
    expect(await db.refreshToken.count({ where: { userId: targetId, revokedAt: null } })).toBeGreaterThan(0);

    const again = await request(app).post(path()).set(as(superToken)).send({ userId: targetId });
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(first.body.data);
    expect(await db.seasonAdmin.count({ where: { seasonId, userId: targetId } })).toBe(1);

    const list = await request(app).get(path()).set(as(superToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual(first.body.data);
  });

  it("makes the assigned admin able to administer the season (canAdminister) after signing in again", async () => {
    const fresh = await login(app, targetEmail);
    const res = await request(app).get(`/api/v1/seasons/by-code/${seasonCode}`).set(as(fresh));
    expect(res.status).toBe(200);
    expect(res.body.data.canAdminister).toBe(true);
  });

  it("removes the admin (200), idempotently, and canAdminister goes with it", async () => {
    const removed = await request(app)
      .delete(path(`/${targetId}`))
      .set(as(superToken));
    expect(removed.status).toBe(200);
    expect(removed.body.data.admins.map((a: { userId: number }) => a.userId)).not.toContain(targetId);
    expect(await db.seasonAdmin.count({ where: { seasonId, userId: targetId } })).toBe(0);

    const again = await request(app)
      .delete(path(`/${targetId}`))
      .set(as(superToken));
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(removed.body.data);

    const fresh = await login(app, targetEmail);
    const res = await request(app).get(`/api/v1/seasons/by-code/${seasonCode}`).set(as(fresh));
    // Either the season is no longer visible to them or it is read-only.
    expect(res.status === 403 || res.body.data.canAdminister === false).toBe(true);
  });
});
