/**
 * Users API: the error paths, filters and role matrix the main users suite
 * leaves unexercised. Every route here is SUPER-only.
 */
import request from "supertest";

// Stub the mailer the way invites-routes.test.ts does: invite sending is
// send-first and answers 503 email_not_configured with no transport, and a
// staging .env with GMAIL_* set would otherwise mail @jpc.test addresses.
// Lazy wrapper: jest.mock is hoisted above this const.
const mockSendInviteEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
  isEmailConfigured: () => true,
}));

import { createApp } from "../../app";
import { db } from "../../db/client";
import {
  bearer,
  cleanupTestData,
  createTestSeason,
  createTestUser,
  createUnactivatedTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superToken: string;
let superId: number;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  await cleanupTestData();
  const su = await createTestUser("edge-super", "SUPER");
  superId = su.id;
  superToken = await login(app, su.email);
  for (const role of ["ADMIN", "LEADER", "STUDENT", "MENTOR"] as const) {
    const u = await createTestUser(`edge-${role.toLowerCase()}`, role);
    tokens[role] = await login(app, u.email);
  }
});

afterAll(async () => {
  await cleanupTestData();
});

describe("role matrix: every /users route refuses non-SUPER roles", () => {
  const routes: [string, string, object?][] = [
    ["get", "/api/v1/users"],
    ["get", "/api/v1/users/invites/pending"],
    ["post", "/api/v1/users/invites/pending"],
    ["get", "/api/v1/users/1"],
    ["patch", "/api/v1/users/1", { name: "Nobody", role: "STUDENT", graduationYear: null }],
    ["post", "/api/v1/users/1/deactivate"],
    ["post", "/api/v1/users/1/reactivate"],
    ["post", "/api/v1/users", { name: "Nobody", email: "x@jpc.test", role: "STUDENT" }],
    ["post", "/api/v1/users/1/invite"],
  ];

  it.each(["ADMIN", "LEADER", "STUDENT", "MENTOR"])("%s gets 403 forbidden on all of them", async (role) => {
    for (const [method, path, body] of routes) {
      const r = request(app)[method as "get"](path).set(bearer(tokens[role]!));
      const res = body ? await r.send(body) : await r;
      expect([path, res.status, res.body.error?.code]).toEqual([path, 403, "forbidden"]);
    }
  });

  it("an anonymous caller gets 401 on all of them", async () => {
    for (const [method, path] of routes) {
      const res = await request(app)[method as "get"](path);
      expect([path, res.status]).toEqual([path, 401]);
    }
  });
});

describe("malformed ids are 400 bad_request, not 404 or 500", () => {
  it.each([
    ["get", "/api/v1/users/abc"],
    ["patch", "/api/v1/users/abc"],
    ["post", "/api/v1/users/abc/deactivate"],
    ["post", "/api/v1/users/abc/reactivate"],
    ["post", "/api/v1/users/abc/invite"],
  ])("%s %s", async (method, path) => {
    const res = await request(app)[method as "get"](path).set(bearer(superToken));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "bad_request", message: "Invalid user id." });
  });
});

describe("unknown ids are 404 not_found", () => {
  const missing = 2_000_000_000;
  it.each([
    ["patch", `/api/v1/users/${missing}`, { name: "Nobody", role: "STUDENT", graduationYear: null }],
    ["post", `/api/v1/users/${missing}/deactivate`, undefined],
    ["post", `/api/v1/users/${missing}/reactivate`, undefined],
    ["post", `/api/v1/users/${missing}/invite`, undefined],
  ])("%s %s", async (method, path, body) => {
    const r = request(app)[method as "get"](path).set(bearer(superToken));
    const res = body ? await r.send(body) : await r;
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("GET /api/v1/users filters", () => {
  it("rejects an unknown role, status or a non-numeric cursor", async () => {
    for (const [qs, message] of [
      ["role=WIZARD", "Invalid role filter."],
      ["status=sleeping", "Invalid status filter."],
      ["cursor=abc", "Invalid cursor."],
    ]) {
      const res = await request(app).get(`/api/v1/users?${qs}`).set(bearer(superToken));
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ code: "bad_request", message });
    }
  });

  it("filters by role", async () => {
    const res = await request(app)
      .get("/api/v1/users?q=space-v2-test-edge&role=MENTOR&limit=100")
      .set(bearer(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThan(0);
    expect(res.body.data.users.every((u: { role: string }) => u.role === "MENTOR")).toBe(true);
  });

  it("filters by status=pending and status=inactive", async () => {
    const pending = await createUnactivatedTestUser("edge-filter-pending", "STUDENT");
    const gone = await createTestUser("edge-filter-gone", "STUDENT");
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const p = await request(app).get("/api/v1/users?q=edge-filter&status=pending").set(bearer(superToken));
    expect(p.body.data.users.map((u: { id: number }) => u.id)).toEqual([pending.id]);

    const i = await request(app).get("/api/v1/users?q=edge-filter&status=inactive").set(bearer(superToken));
    expect(i.body.data.users.map((u: { id: number }) => u.id)).toEqual([gone.id]);
  });

  it.each(["0", "101", "1.5", "abc"])("falls back to a page of 50 for limit=%s", async (limit) => {
    const res = await request(app).get(`/api/v1/users?limit=${limit}`).set(bearer(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeLessThanOrEqual(50);
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("rejects an invalid body with the schema's message", async () => {
    const u = await createTestUser("edge-patch-bad", "STUDENT");
    const res = await request(app)
      .patch(`/api/v1/users/${u.id}`)
      .set(bearer(superToken))
      .send({ name: "x", role: "STUDENT", graduationYear: null });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    expect(res.body.error.message).toBe("At least 2 characters.");
  });

  it("refuses to change email (strict body)", async () => {
    const u = await createTestUser("edge-patch-email", "STUDENT");
    const res = await request(app)
      .patch(`/api/v1/users/${u.id}`)
      .set(bearer(superToken))
      .send({ name: "Renamed", role: "STUDENT", graduationYear: null, email: testEmail("hijack") });
    expect(res.status).toBe(400);
  });

  it("an edit of someone serving keeps their seat and refresh tokens", async () => {
    const season = await createTestSeason();
    const admin = await createTestUser("edge-rename-admin", "ADMIN");
    await db.seasonAdmin.create({ data: { seasonId: season.id, userId: admin.id } });
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: admin.email, password: "correct-horse-battery" });
    const refreshToken = loginRes.body.data.refreshToken as string;

    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}`)
      .set(bearer(superToken))
      .send({ name: "Renamed Admin", graduationYear: 2015 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Renamed Admin");
    expect(await db.seasonAdmin.count({ where: { userId: admin.id } })).toBe(1);

    const refreshed = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(refreshed.status).toBe(200);
  });

  it("granting SUPER with confirmSuper succeeds", async () => {
    const u = await createTestUser("edge-grant-super", "MENTOR");
    const res = await request(app)
      .patch(`/api/v1/users/${u.id}`)
      .set(bearer(superToken))
      .send({ name: "Test edge-grant-super", role: "SUPER", graduationYear: null, confirmSuper: true });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("SUPER");
  });
});

describe("POST /api/v1/users", () => {
  it("rejects an invalid body", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set(bearer(superToken))
      .send({ name: "Valid Name", email: "not-an-email", role: "STUDENT" });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "bad_request", message: "Must be a valid email." });
  });

  it("requires a graduation year for staff roles (alumni only) and a sane range for anyone", async () => {
    for (const [body, message] of [
      [{ role: "MENTOR" }, "Required for this role."],
      [{ role: "STUDENT", graduationYear: 1989 }, "Must be between 1990"],
      [{ role: "STUDENT", graduationYear: 2101 }, "Must be between 1990"],
    ] as const) {
      const res = await request(app)
        .post("/api/v1/users")
        .set(bearer(superToken))
        .send({ name: "Valid Name", email: testEmail("edge-year"), ...body });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(message);
    }
  });

  it("requires confirmSuper to create a SUPER, and creates one with it", async () => {
    const email = testEmail("edge-new-super");
    const refused = await request(app)
      .post("/api/v1/users")
      .set(bearer(superToken))
      .send({ name: "New Super", email, role: "SUPER" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("confirm_super_required");
    expect(await db.user.count({ where: { email } })).toBe(0);

    const ok = await request(app)
      .post("/api/v1/users")
      .set(bearer(superToken))
      .send({ name: "New Super", email, role: "SUPER", confirmSuper: true });
    expect(ok.status).toBe(201);
  });

  it("creates a STUDENT with a student profile and a live invite, and no password", async () => {
    const email = testEmail("edge-new-student");
    const res = await request(app)
      .post("/api/v1/users")
      .set(bearer(superToken))
      .send({ name: "New Student", email, role: "STUDENT", graduationYear: 2020 });
    expect(res.status).toBe(201);
    const id = res.body.data.userId as number;
    const row = await db.user.findUnique({
      where: { id },
      select: { passwordHash: true, graduationYear: true, studentProfile: { select: { id: true } } },
    });
    expect(row).toMatchObject({ passwordHash: null, graduationYear: 2020 });
    expect(row?.studentProfile).not.toBeNull();
    expect(await db.inviteToken.count({ where: { userId: id, invitedById: superId } })).toBe(1);
  });

  it("creates a non-student without a student profile", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set(bearer(superToken))
      .send({ name: "New Mentor", email: testEmail("edge-new-mentor"), role: "MENTOR", graduationYear: 2015 });
    expect(res.status).toBe(201);
    expect(await db.studentProfile.count({ where: { userId: res.body.data.userId } })).toBe(0);
  });
});

describe("deactivate / reactivate", () => {
  it("reactivating a deleted student also clears the profile's deletedAt", async () => {
    const s = await createTestUser("edge-reactivate", "STUDENT");
    const stamp = new Date();
    await db.studentProfile.create({ data: { userId: s.id, deletedAt: stamp } });
    await db.user.update({ where: { id: s.id }, data: { deletedAt: stamp } });

    const res = await request(app).post(`/api/v1/users/${s.id}/reactivate`).set(bearer(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deletedAt: null });
    const profile = await db.studentProfile.findUnique({ where: { userId: s.id }, select: { deletedAt: true } });
    expect(profile?.deletedAt).toBeNull();
  });

  it("a deactivated user can no longer log in", async () => {
    const s = await createTestUser("edge-deactivate-login", "STUDENT");
    const res = await request(app).post(`/api/v1/users/${s.id}/deactivate`).set(bearer(superToken));
    expect(res.status).toBe(200);
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: s.email, password: "correct-horse-battery" });
    expect(loginRes.status).toBe(401);
    expect(loginRes.body.error.code).toBe("invalid_credentials");
  });

  it("deactivating a SUPER while another remains succeeds", async () => {
    const other = await createTestUser("edge-other-super", "SUPER");
    const res = await request(app).post(`/api/v1/users/${other.id}/deactivate`).set(bearer(superToken));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/users/:id/invite (resend)", () => {
  it("refuses a deactivated account with 409 user_deleted", async () => {
    const u = await createUnactivatedTestUser("edge-resend-deleted", "STUDENT");
    await db.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
    const res = await request(app).post(`/api/v1/users/${u.id}/invite`).set(bearer(superToken));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("user_deleted");
  });

  it("refuses an account that has logged in even without a password", async () => {
    const u = await createUnactivatedTestUser("edge-resend-loggedin", "STUDENT");
    await db.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    const res = await request(app).post(`/api/v1/users/${u.id}/invite`).set(bearer(superToken));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("already_activated");
  });

  it("issues a fresh invite to an unactivated account and returns the panel", async () => {
    const u = await createUnactivatedTestUser("edge-resend-ok", "STUDENT");
    const res = await request(app).post(`/api/v1/users/${u.id}/invite`).set(bearer(superToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ expiresAt: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{64}/);
    expect(await db.inviteToken.count({ where: { userId: u.id } })).toBe(1);
  });
});
