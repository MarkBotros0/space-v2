import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superToken: string;
let adminToken: string;
let superUser: { id: number; email: string };

beforeAll(async () => {
  await cleanupTestData();
  superUser = await createTestUser("super", "SUPER");
  const admin = await createTestUser("admin", "ADMIN");
  superToken = await login(app, superUser.email);
  adminToken = await login(app, admin.email);
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/users", () => {
  it("is SUPER-only — canManageUsers, enforced at the endpoint not the page", async () => {
    const res = await request(app)
      .get("/api/v1/users")
      .set("authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("derives the four badge states server-side and never ships a hash", async () => {
    const invited = await createUnactivatedTestUser("invited", "STUDENT");
    const pending = await createUnactivatedTestUser("pending", "STUDENT");
    const inactive = await createTestUser("inactive", "STUDENT");
    await db.user.update({ where: { id: inactive.id }, data: { deletedAt: new Date() } });
    await db.inviteToken.create({
      data: {
        token: "0".repeat(64), // digest-shaped placeholder, no raw token exists
        userId: invited.id,
        invitedById: superUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    // Scoped to this suite's fixtures: the live staging DB holds real users
    // that sort ahead of "Test …" by name, so an unfiltered page of 100 need
    // not contain any of ours. cleanupTestData ran in beforeAll and suites run
    // serially, so every "space-v2-test-" row here is this suite's.
    const res = await request(app)
      .get("/api/v1/users?q=space-v2-test-&limit=100")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);

    const byId = new Map(res.body.data.users.map((u: { id: number }) => [u.id, u]));
    expect(byId.get(superUser.id)).toMatchObject({ status: "active" });
    expect(byId.get(invited.id)).toMatchObject({ status: "invited" });
    expect(byId.get(pending.id)).toMatchObject({ status: "pending" });
    expect(byId.get(inactive.id)).toMatchObject({ status: "inactive" });
    // R85's fix: the hash is reduced to `status` before the response is built.
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("paginates by cursor — the API v1's unbounded page never had (R84)", async () => {
    // Fixture-scoped: three users whose names share a label nothing else in
    // the database carries, so the expected pages are exactly computable.
    const probes = [];
    for (const n of [1, 2, 3]) probes.push(await createTestUser(`page-probe-${n}`, "STUDENT"));
    const probeIds = probes.map((p) => p.id);

    const first = await request(app)
      .get("/api/v1/users?q=page-probe&limit=2")
      .set("authorization", `Bearer ${superToken}`);
    expect(first.status).toBe(200);
    expect(first.body.data.total).toBe(3);
    expect(first.body.data.users).toHaveLength(2);
    expect(first.body.data.nextCursor).not.toBeNull();

    const second = await request(app)
      .get(`/api/v1/users?q=page-probe&limit=2&cursor=${first.body.data.nextCursor}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.users).toHaveLength(1);
    expect(second.body.data.nextCursor).toBeNull();

    const firstIds: number[] = first.body.data.users.map((u: { id: number }) => u.id);
    const secondIds: number[] = second.body.data.users.map((u: { id: number }) => u.id);
    // Disjoint, and together exactly the three probes.
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
    expect([...firstIds, ...secondIds].sort()).toEqual([...probeIds].sort());
  });

  it("filters by q against name and email, case-insensitively", async () => {
    const needle = await createTestUser("needle-xyzzy", "STUDENT");
    const res = await request(app)
      .get("/api/v1/users?q=XYZZY")
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.users.map((u: { id: number }) => u.id)).toContain(needle.id);
  });
});

describe("GET /api/v1/users/:id", () => {
  it("returns invite metadata — issuedAt/expiresAt/invitedByName, never a token (R75)", async () => {
    const invited = await createUnactivatedTestUser("detail-invited", "STUDENT");
    await db.inviteToken.create({
      data: {
        token: "1".repeat(64),
        userId: invited.id,
        invitedById: superUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await request(app)
      .get(`/api/v1/users/${invited.id}`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("invited");
    expect(res.body.data.invite).toMatchObject({ usedAt: null });
    expect(Object.keys(res.body.data.invite).sort()).toEqual([
      "expiresAt", "invitedByName", "issuedAt", "usedAt",
    ]);
  });

  it("404s an unknown id and 403s a non-SUPER", async () => {
    const missing = await request(app)
      .get("/api/v1/users/99999999")
      .set("authorization", `Bearer ${superToken}`);
    expect(missing.status).toBe(404);

    const forbidden = await request(app)
      .get(`/api/v1/users/${superUser.id}`)
      .set("authorization", `Bearer ${adminToken}`);
    expect(forbidden.status).toBe(403);
  });
});
