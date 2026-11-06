// Plan 18 M13 against a real database: an access token issued before
// User.sessionsValidFrom is refused. Needs migration
// 20261105120000_user_sessions_valid_from applied.
import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { PASSWORD, cleanupTestData, createTestUser, login } from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

/** Access tokens carry whole-second iat; step past the issuing second. */
const nextSecond = () => new Promise((r) => setTimeout(r, 1100));

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("User.sessionsValidFrom (Plan 18 M13)", () => {
  it("refuses an access token minted before a demotion", async () => {
    const admin = await createTestUser("m13-demoted", "ADMIN");
    const superUser = await createTestUser("m13-super", "SUPER");
    const before = await login(app, admin.email);
    const superToken = await login(app, superUser.email);
    await nextSecond();

    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ name: "Test m13-demoted", role: "MENTOR", graduationYear: 2015 });
    expect(res.status).toBe(200);

    const stale = await request(app).get("/api/v1/me").set("authorization", `Bearer ${before}`);
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe("unauthorized");
    // The SUPER who made the change is untouched.
    expect((await request(app).get("/api/v1/me").set("authorization", `Bearer ${superToken}`)).status).toBe(200);
  });

  it("graduation ends the graduate's access token; their refresh token gets one with the new claims", async () => {
    const u = await createTestUser("m13-graduate", "STUDENT");
    const superUser = await createTestUser("m13-grad-super", "SUPER");
    const session = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD });
    const { accessToken, refreshToken } = session.body.data as { accessToken: string; refreshToken: string };
    const superToken = await login(app, superUser.email);
    await nextSecond();

    const res = await request(app)
      .post(`/api/v1/students/${u.id}/graduate`)
      .set("authorization", `Bearer ${superToken}`)
      .send({ graduationYear: 2024 });
    expect(res.status).toBe(200);

    // The old token said graduationYear: null, i.e. a current student.
    expect((await request(app).get("/api/v1/me").set("authorization", `Bearer ${accessToken}`)).status).toBe(401);
    const rotated = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(rotated.status).toBe(200);
    const fresh = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${rotated.body.data.accessToken}`);
    expect(fresh.status).toBe(200);
    const claims = JSON.parse(
      Buffer.from(String(rotated.body.data.accessToken).split(".")[1]!, "base64url").toString(),
    ) as { graduationYear: number | null };
    expect(claims.graduationYear).toBe(2024);
  });

  it("logout-all ends the access token that asked for it", async () => {
    const u = await createTestUser("m13-logout-all", "STUDENT");
    const token = await login(app, u.email);
    await nextSecond();
    const res = await request(app).post("/api/v1/auth/logout-all").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((await request(app).get("/api/v1/me").set("authorization", `Bearer ${token}`)).status).toBe(401);
  });

  it("password change ends every access token; this device recovers through its spared refresh token", async () => {
    const u = await createTestUser("m13-password", "STUDENT");
    const session = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD });
    const { accessToken, refreshToken } = session.body.data as { accessToken: string; refreshToken: string };
    await nextSecond();

    const change = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: "An0ther-Passw0rd!", refreshToken });
    expect(change.status).toBe(200);

    expect((await request(app).get("/api/v1/me").set("authorization", `Bearer ${accessToken}`)).status).toBe(401);
    const rotated = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(rotated.status).toBe(200);
    const fresh = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${rotated.body.data.accessToken}`);
    expect(fresh.status).toBe(200);
  });
});
