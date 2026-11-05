/**
 * /me edge cases the self-service and settings suites leave out: invalid
 * bodies, a password change with no presented refresh token, and a student
 * whose profile row doesn't exist yet (blank on read, created on write).
 */
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { cleanupTestData, createTestUser, PASSWORD } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

async function session(email: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return res.body.data as { accessToken: string; refreshToken: string };
}

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

describe("PATCH /api/v1/me", () => {
  it("400s a name that is too short, with the schema's message", async () => {
    const u = await createTestUser("me-edge-name", "LEADER");
    const { accessToken } = await session(u.email);
    const res = await request(app).patch("/api/v1/me").set("authorization", `Bearer ${accessToken}`).send({ name: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    const row = await db.user.findUnique({ where: { id: u.id }, select: { name: true } });
    expect(row?.name).toBe("Test me-edge-name");
  });
});

describe("POST /api/v1/me/password", () => {
  it("400s a body missing the new password", async () => {
    const u = await createTestUser("me-edge-pw-bad", "STUDENT");
    const { accessToken } = await session(u.email);
    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("with no refresh token presented, revokes every session including this device's", async () => {
    const u = await createTestUser("me-edge-pw-all", "STUDENT");
    const a = await session(u.email);
    const b = await session(u.email);
    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${a.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: "a-brand-new-password-9" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true, sessionsRevoked: 2 });
    for (const t of [a.refreshToken, b.refreshToken]) {
      expect((await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t })).status).toBe(401);
    }
    const relog = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: "a-brand-new-password-9" });
    expect(relog.status).toBe(200);
  });
});

describe("/api/v1/me/profile for a student with no profile row", () => {
  it("GET answers with blank profile fields rather than an error", async () => {
    const u = await createTestUser("me-edge-noprofile", "STUDENT");
    const { accessToken } = await session(u.email);
    const res = await request(app).get("/api/v1/me/profile").set("authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      name: "Test me-edge-noprofile", email: u.email, university: null, phone: null, activeSeasonTitle: null,
    });
  });

  it("PATCH creates the missing row (upsert) instead of throwing like v1 did", async () => {
    const u = await createTestUser("me-edge-noprofile-patch", "STUDENT");
    const { accessToken } = await session(u.email);
    const res = await request(app)
      .patch("/api/v1/me/profile")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ university: "Somewhere" });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.university).toBe("Somewhere");
    expect(await db.studentProfile.count({ where: { userId: u.id } })).toBe(1);
  });

  it("GET 404s for an account deactivated after login", async () => {
    const u = await createTestUser("me-edge-profile-gone", "STUDENT");
    const { accessToken } = await session(u.email);
    await db.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
    const res = await request(app).get("/api/v1/me/profile").set("authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("PATCH /api/v1/me/profile body shape", () => {
  it("400s an array body", async () => {
    const u = await createTestUser("me-edge-array", "STUDENT");
    await db.studentProfile.create({ data: { userId: u.id } });
    const { accessToken } = await session(u.email);
    const res = await request(app)
      .patch("/api/v1/me/profile")
      .set("authorization", `Bearer ${accessToken}`)
      .send([{ university: "x" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "bad_request", message: "Invalid profile body." });
  });

  it("400s an allowed key with an invalid value", async () => {
    const u = await createTestUser("me-edge-badvalue", "STUDENT");
    await db.studentProfile.create({ data: { userId: u.id } });
    const { accessToken } = await session(u.email);
    const res = await request(app)
      .patch("/api/v1/me/profile")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ phone: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});
