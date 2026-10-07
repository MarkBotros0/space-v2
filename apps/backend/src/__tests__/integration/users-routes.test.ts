import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  cleanupTestData,
  createTestSeason,
  createTestUser,
  createUnactivatedTestUser,
  login,
  PASSWORD,
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

describe("PATCH /api/v1/users/:id — role change is revocation (spec 11 D3, ruling C7)", () => {
  it("demoting an ADMIN deletes their SeasonAdmin rows and kills their refresh token", async () => {
    const target = await createTestUser("demote-me", "ADMIN");
    const season = await createTestSeason();
    await db.seasonAdmin.create({ data: { seasonId: season.id, userId: target.id } });

    // A live session for the target, captured before the demotion.
    const targetLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: PASSWORD });
    expect(targetLogin.status).toBe(200);
    const oldRefresh = targetLogin.body.data.refreshToken as string;

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test demote-me", role: "STUDENT", graduationYear: 2015 });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("STUDENT");

    // The scope rows are gone — isAdminOfSeason has nothing left to admit.
    const scopeRows = await db.seasonAdmin.count({ where: { userId: target.id } });
    expect(scopeRows).toBe(0);

    // And the old session cannot rotate: the claims cannot outlive the change.
    const rotate = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefresh });
    expect(rotate.status).toBe(401);
  });

  it("refuses changing your own role (D7) — name changes on yourself stay allowed", async () => {
    const own = await request(app)
      .patch(`/api/v1/users/${superUser.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test super", role: "STUDENT", graduationYear: null });
    expect(own.status).toBe(409);
    expect(own.body.error.code).toBe("cannot_change_own_role");

    const rename = await request(app)
      .patch(`/api/v1/users/${superUser.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test super renamed", role: "SUPER", graduationYear: null });
    expect(rename.status).toBe(200);
  });

  it("demotes a SUPER while others remain — the guard is not a blanket refusal", async () => {
    // The "last SUPER" branch is unreachable here: the shared staging DB always
    // holds real SUPERs. That branch is pinned by super-guard.test.ts (the pure
    // decision) and by Task 10's mutation pass; this case pins that the PATCH
    // path runs the locking guard and still lets a legitimate demotion through.
    const second = await createTestUser("second-super", "SUPER");
    const ok = await request(app)
      .patch(`/api/v1/users/${second.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test second-super", role: "STUDENT", graduationYear: 2015 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.role).toBe("STUDENT");
  });

  it("serialises two concurrent SUPER demotions — both run, and the DB is never left SUPER-less", async () => {
    // Two fixture SUPERs demoted at once. With real SUPERs present both must
    // succeed; what this pins is that the FOR UPDATE locks do not deadlock or
    // error when two transactions contend for the same rows.
    const a = await createTestUser("race-super-a", "SUPER");
    const b = await createTestUser("race-super-b", "SUPER");
    const [ra, rb] = await Promise.all(
      [a, b].map((t) =>
        request(app)
          .patch(`/api/v1/users/${t.id}`)
          .set("authorization", `Bearer ${superToken}`)
          .send({ name: "Test racer", role: "STUDENT", graduationYear: 2015 }),
      ),
    );
    expect([ra!.status, rb!.status]).toEqual([200, 200]);
    expect(await db.user.count({ where: { role: "SUPER", deletedAt: null } })).toBeGreaterThan(0);
  });

  it("requires confirmSuper to grant SUPER (D7 rec 3)", async () => {
    const target = await createTestUser("promote-me", "STUDENT");
    const refused = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test promote-me", role: "SUPER", graduationYear: null });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("confirm_super_required");

    const granted = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test promote-me", role: "SUPER", graduationYear: null, confirmSuper: true });
    expect(granted.status).toBe(200);
  });

  it("creates a StudentProfile when a role change lands on STUDENT (R46's fix)", async () => {
    const target = await createTestUser("to-student", "MENTOR");
    // createTestUser writes no profile for MENTOR.
    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test to-student", role: "STUDENT", graduationYear: null });
    expect(res.status).toBe(200);
    const profile = await db.studentProfile.findUnique({ where: { userId: target.id } });
    expect(profile).not.toBeNull();
  });
});

describe("POST /api/v1/users/:id/deactivate & reactivate", () => {
  it("soft-deletes, revokes the refresh token, and refuses self (R56/R57 + D6)", async () => {
    const target = await createTestUser("deactivate-me", "STUDENT");
    const targetLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: PASSWORD });
    const oldRefresh = targetLogin.body.data.refreshToken as string;

    const self = await request(app)
      .post(`/api/v1/users/${superUser.id}/deactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("cannot_deactivate_self");

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/deactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deletedAt).not.toBeNull();

    // Asserted on the rows BEFORE any rotate attempt: rotating revokes the
    // presented token itself, and issueSession's deletedAt check would 401 it
    // anyway, so the 401 below cannot prove the revocation on its own.
    // Otherwise a reactivation would resurrect every pre-deactivation session.
    const live = await db.refreshToken.count({ where: { userId: target.id, revokedAt: null } });
    expect(live).toBe(0);

    const rotate = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefresh });
    expect(rotate.status).toBe(401);

    const back = await request(app)
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set("authorization", `Bearer ${superToken}`);
    expect(back.status).toBe(200);
    expect(back.body.data.deletedAt).toBeNull();
  });
});

describe("PATCH /api/v1/users/:id — response parity with GET", () => {
  it("returns exactly what a following GET returns, invite panel included", async () => {
    const target = await createUnactivatedTestUser("parity", "STUDENT");
    await db.inviteToken.create({
      data: {
        token: "2".repeat(64),
        userId: target.id,
        invitedById: superUser.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const patched = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test parity renamed", role: "STUDENT", graduationYear: null });
    const fetched = await request(app)
      .get(`/api/v1/users/${target.id}`)
      .set("authorization", `Bearer ${superToken}`);

    expect(patched.status).toBe(200);
    expect(patched.body.data.invite).not.toBeNull();
    expect(patched.body.data).toEqual(fetched.body.data);
  });
});
