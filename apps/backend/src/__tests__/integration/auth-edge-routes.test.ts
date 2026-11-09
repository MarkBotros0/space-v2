/**
 * Auth API edge cases the main auth and password-reset suites leave out:
 * bad bodies on every anonymous endpoint, logout and logout-all semantics,
 * deleted and unactivated accounts, and malformed bearer headers.
 */
import { SignJWT } from "jose";
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { config } from "../../lib/config";
import { cleanupTestData, createTestSeason, createTestUser, createUnactivatedTestUser, PASSWORD } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

async function session(email: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data as { accessToken: string; refreshToken: string };
}

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("login", () => {
  it("answers an unknown email exactly like a wrong password", async () => {
    const u = await createTestUser("auth-edge-known", "STUDENT");
    const wrong = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: "nope-nope-nope" });
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "space-v2-test-nobody@jpc.test", password: "nope-nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("refuses a deactivated account and an invited-but-unactivated one", async () => {
    const gone = await createTestUser("auth-edge-gone", "STUDENT");
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const invited = await createUnactivatedTestUser("auth-edge-invited", "STUDENT");
    for (const email of [gone.email, invited.email]) {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("invalid_credentials");
    }
  });

  it("stamps lastLoginAt and never returns the password hash", async () => {
    const u = await createTestUser("auth-edge-stamp", "LEADER");
    const group = await db.group.create({ data: { seasonId: (await createTestSeason()).id, name: "G" } });
    await db.groupLeader.create({ data: { groupId: group.id, userId: u.id } });
    const res = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({ id: u.id, name: "Test auth-edge-stamp", email: u.email, role: "LEADER" });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    const row = await db.user.findUnique({ where: { id: u.id }, select: { lastLoginAt: true } });
    expect(row?.lastLoginAt).not.toBeNull();
  });
});

describe("refresh", () => {
  it("400s a missing refresh token and 401s an unknown one", async () => {
    const missing = await request(app).post("/api/v1/auth/refresh").send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("bad_request");
    const unknown = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: "not-a-real-token" });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe("invalid_token");
  });

  it("401s an expired refresh token", async () => {
    const u = await createTestUser("auth-edge-expired", "STUDENT");
    const { refreshToken } = await session(u.email);
    await db.refreshToken.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it("401s the refresh token of a user deactivated after login", async () => {
    const u = await createTestUser("auth-edge-deactivated", "STUDENT");
    const { refreshToken } = await session(u.email);
    await db.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it("puts the user's current scopes into the new access token", async () => {
    const u = await createTestUser("auth-edge-scopes", "ADMIN");
    const { refreshToken } = await session(u.email);
    const season = await db.season.create({
      data: {
        code: `space-v2-test-${Date.now().toString(16)}`,
        title: "Test Season",
        program: "TEST",
        year: 2099,
        status: "ACTIVE",
        startDate: new Date("2099-01-01"),
        endDate: new Date("2099-12-31"),
      },
      select: { id: true },
    });
    await db.seasonAdmin.create({ data: { seasonId: season.id, userId: u.id } });

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    const payload = JSON.parse(Buffer.from(res.body.data.accessToken.split(".")[1], "base64url").toString());
    expect(payload.seasonAdminIds).toEqual([season.id]);
  });
});

describe("logout", () => {
  it("400s a missing token", async () => {
    const res = await request(app).post("/api/v1/auth/logout").send({});
    expect(res.status).toBe(400);
  });

  it("is idempotent and does not reveal whether a token existed", async () => {
    const res = await request(app).post("/api/v1/auth/logout").send({ refreshToken: "never-issued" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
  });

  it("revokes only that session's refresh token", async () => {
    const u = await createTestUser("auth-edge-logout", "STUDENT");
    const a = await session(u.email);
    const b = await session(u.email);
    await request(app).post("/api/v1/auth/logout").send({ refreshToken: a.refreshToken }).expect(200);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: a.refreshToken })).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: b.refreshToken })).status).toBe(200);
  });
});

describe("logout-all", () => {
  it("requires an access token", async () => {
    const res = await request(app).post("/api/v1/auth/logout-all");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("revokes every live session and reports how many", async () => {
    const u = await createTestUser("auth-edge-logout-all", "STUDENT");
    const a = await session(u.email);
    const b = await session(u.email);
    const res = await request(app).post("/api/v1/auth/logout-all").set("authorization", `Bearer ${a.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(2);
    for (const t of [a.refreshToken, b.refreshToken]) {
      expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t })).status).toBe(401);
    }
  });
});

describe("accept-invite and reset-password bodies", () => {
  it("accept-invite 400s a short password before looking at the token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: "x".repeat(64), password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("accept-invite refuses an unknown token with the opaque invalid_invite", async () => {
    const res = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: "f".repeat(64), password: "a-strong-password-1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_invite");
  });

  it("forgot-password 400s a malformed email", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "nope" });
    expect(res.status).toBe(400);
  });

  it("reset-password refuses an unknown code with invalid_reset_token, not 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "a".repeat(64), password: "a-strong-password-1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reset_token");
  });
});

describe("bearer header handling", () => {
  const me = () => request(app).get("/api/v1/me");

  it.each([
    ["no header", undefined],
    ["wrong scheme", "Basic abc"],
    ["empty bearer", "Bearer   "],
    ["garbage token", "Bearer not.a.jwt"],
  ])("401s %s", async (_label, header) => {
    const res = header ? await me().set("authorization", header) : await me();
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: "unauthorized", message: "Missing or invalid access token." });
  });

  it("401s an expired access token and one for the wrong audience", async () => {
    const key = new TextEncoder().encode(config.authSecret);
    const expired = await new SignJWT({ role: "STUDENT" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setAudience("jpc-mobile")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    const wrongAud = await new SignJWT({ role: "STUDENT" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setAudience("someone-else")
      .setExpirationTime("900s")
      .sign(key);
    for (const t of [expired, wrongAud]) {
      expect((await me().set("authorization", `Bearer ${t}`)).status).toBe(401);
    }
  });
});
