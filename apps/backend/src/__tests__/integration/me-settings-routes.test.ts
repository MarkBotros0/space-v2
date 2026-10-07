import request from "supertest";

import { createApp } from "../../app";
import { db } from "../../db/client";
import { issueSession } from "../../lib/auth/tokens";
import {
  PASSWORD,
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await db.$disconnect();
});

describe("GET /api/v1/me — the two spec-flagged fixes", () => {
  it("returns user: null for a soft-deleted row (spec 11 §7's live inconsistency)", async () => {
    const ghost = await createTestUser("ghost", "STUDENT");
    const ghostToken = await login(app, ghost.email);
    await db.user.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${ghostToken}`);
    expect(res.status).toBe(200);
    // packages/shared/src/auth.ts:53 documented this and me.ts didn't do it.
    expect(res.body.data.user).toBeNull();
  });

  it("carries hasPassword so the settings screen can branch before submitting (R27)", async () => {
    const withPw = await createTestUser("has-pw", "STUDENT");
    const token = await login(app, withPw.email);
    const res = await request(app)
      .get("/api/v1/me")
      .set("authorization", `Bearer ${token}`);
    expect(res.body.data.user.hasPassword).toBe(true);
  });
});

describe("PATCH /api/v1/me", () => {
  it("updates the caller's own name — trimmed — and returns the row (spec 18 R21/R23)", async () => {
    const u = await createTestUser("rename", "STUDENT");
    const token = await login(app, u.email);
    const res = await request(app)
      .patch("/api/v1/me")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "  Renamed Person  " });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Renamed Person");
  });

  it("refuses a body-supplied subject id — self-scope by construction (spec 18 §4)", async () => {
    const u = await createTestUser("no-subject", "STUDENT");
    const token = await login(app, u.email);
    const res = await request(app)
      .patch("/api/v1/me")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Fine Name", userId: 1 });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/me/password — the change that finally evicts (spec 18 D1, R29)", () => {
  it("revokes every other session and spares the presented one", async () => {
    const u = await createTestUser("pw-change", "STUDENT");
    // Two live sessions for the same user.
    const sessionA = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });
    const sessionB = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });
    const accessB = sessionB.body.data.accessToken as string;
    const refreshA = sessionA.body.data.refreshToken as string;
    const refreshB = sessionB.body.data.refreshToken as string;

    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${accessB}`)
      .send({
        currentPassword: PASSWORD,
        newPassword: "a-whole-new-password",
        refreshToken: refreshB,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.sessionsRevoked).toBe(1);

    // Session A (the "attacker" holding a stolen session) is evicted...
    const rotateA = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshA });
    expect(rotateA.status).toBe(401);

    // ...the device that changed the password keeps working...
    const rotateB = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: refreshB });
    expect(rotateB.status).toBe(200);

    // ...and the new hash is cost 12 (D8).
    const row = await db.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("400s a wrong current password (not 401 — the client's refresh interceptor) and 409s a null hash", async () => {
    const u = await createTestUser("pw-wrong", "STUDENT");
    const token = await login(app, u.email);
    const wrong = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${token}`)
      .send({ currentPassword: "not-the-password", newPassword: "a-whole-new-password" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("incorrect_password");
  });

  it("409s no_password for an invited account that has never set one", async () => {
    // Such a user cannot log in (null hash), so mint their session directly —
    // the same function the login route calls after verifying credentials.
    const invited = await createUnactivatedTestUser("pw-none", "STUDENT");
    const issued = await issueSession(invited.id);
    expect(issued).not.toBeNull();

    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${issued!.session.accessToken}`)
      .send({ currentPassword: "anything", newPassword: "a-whole-new-password" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_password");

    // And nothing was written.
    const row = await db.user.findUnique({ where: { id: invited.id }, select: { passwordHash: true } });
    expect(row?.passwordHash).toBeNull();
  });
});

describe("POST /api/v1/auth/logout-all (spec 18 D1 — the lost-phone lever)", () => {
  it("revokes every live refresh token the caller holds, including the current one", async () => {
    const u = await createTestUser("logout-all", "STUDENT");
    const s1 = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });
    const s2 = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: u.email, password: PASSWORD });

    const res = await request(app)
      .post("/api/v1/auth/logout-all")
      .set("authorization", `Bearer ${s2.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(2);

    for (const refreshToken of [s1.body.data.refreshToken, s2.body.data.refreshToken]) {
      const rotate = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
      expect(rotate.status).toBe(401);
    }
  });
});
