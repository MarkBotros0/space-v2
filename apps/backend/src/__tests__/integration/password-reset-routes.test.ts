import { createHash, randomBytes } from "node:crypto";

import request from "supertest";

const mockSendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);
const mockIsEmailConfigured = jest.fn(() => true);
jest.mock("../../lib/email", () => ({
  ...jest.requireActual("../../lib/email"),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

import { createApp } from "../../app";
import { db } from "../../db/client";
import { hashToken } from "../../lib/auth/tokens";
import { issuePasswordReset, requestPasswordReset } from "../../lib/auth/password-reset";
import { issueInvite } from "../../lib/invites";
import {
  PASSWORD,
  cleanupTestData,
  createTestUser,
  createUnactivatedTestUser,
  login,
  testEmail,
} from "./fixtures";

jest.setTimeout(60000);

const app = createApp();

let superUser: { id: number; email: string };

beforeAll(async () => {
  await cleanupTestData();
  superUser = await createTestUser("reset-super", "SUPER");
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(() => {
  mockSendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
  mockIsEmailConfigured.mockReset().mockReturnValue(true);
});

/** The request route answers BEFORE it mints (Decision 9), so poll for the row. */
async function waitForResetRows(userId: number, count: number) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const rows = await db.passwordResetToken.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      select: { token: true, expiresAt: true, usedAt: true, createdAt: true },
    });
    if (rows.length >= count) return rows;
    if (Date.now() > deadline) throw new Error(`expected ${count} reset rows for user ${userId}, saw ${rows.length}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function mintReset(userId: number): Promise<string> {
  const { raw } = await db.$transaction((tx) => issuePasswordReset(tx, userId));
  return raw;
}

describe("POST /api/v1/auth/forgot-password", () => {
  it("answers identically for a known and an unknown email, and mints only for the known one (R67)", async () => {
    const known = await createTestUser("forgot-known", "STUDENT");

    const a = await request(app).post("/api/v1/auth/forgot-password").send({ email: known.email });
    const b = await request(app).post("/api/v1/auth/forgot-password").send({ email: testEmail("nobody") });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual({ data: { ok: true } });
    expect(b.body).toEqual(a.body);

    const rows = await waitForResetRows(known.id, 1);
    // v1's format exactly (R71/R72): stored as a 64-hex SHA-256 digest.
    expect(rows[0]!.token).toMatch(/^[0-9a-f]{64}$/);
    const ttl = rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime();
    expect(Math.abs(ttl - 60 * 60 * 1000)).toBeLessThan(5_000);

    const call = mockSendPasswordResetEmail.mock.calls[0] as [string, string, Date];
    expect(call[0]).toBe(known.email);
    expect(call[1]).toMatch(/^[0-9a-f]{64}$/); // raw: 32 random bytes as hex
    expect(hashToken(call[1])).toBe(rows[0]!.token);
  });

  it("does not wait for the mailer — the response can't time a known address (R69)", async () => {
    const slow = await createTestUser("forgot-slow-smtp", "STUDENT");
    mockSendPasswordResetEmail.mockImplementation(() => new Promise<void>(() => undefined));

    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: slow.email });
    expect(res.status).toBe(200);
  }, 10_000);

  it("rejects a malformed body with 400 (before any lookup)", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});

describe("requestPasswordReset — the policy behind the constant response", () => {
  it("mints nothing for a deleted account (R70)", async () => {
    const gone = await createTestUser("forgot-deleted", "STUDENT");
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await requestPasswordReset(gone.email);
    expect(await db.passwordResetToken.count({ where: { userId: gone.id } })).toBe(0);
  });

  it("mints nothing when no mail transport is configured — a code nobody receives is a liability", async () => {
    const u = await createTestUser("forgot-no-smtp", "STUDENT");
    mockIsEmailConfigured.mockReturnValue(false);
    await requestPasswordReset(u.email);
    expect(await db.passwordResetToken.count({ where: { userId: u.id } })).toBe(0);
  });

  it("ignores a second request inside the 60 s cooldown (no mail-bombing a victim)", async () => {
    const u = await createTestUser("forgot-cooldown", "STUDENT");
    await requestPasswordReset(u.email);
    await requestPasswordReset(u.email);
    expect(await db.passwordResetToken.count({ where: { userId: u.id } })).toBe(1);
    expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("after the cooldown, a new request expires the previous token — one live reset per user (R76 fixed)", async () => {
    const u = await createTestUser("forgot-reissue", "STUDENT");
    await requestPasswordReset(u.email);
    // Age the first row past the cooldown.
    await db.passwordResetToken.updateMany({
      where: { userId: u.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    await requestPasswordReset(u.email);

    const rows = await db.passwordResetToken.findMany({
      where: { userId: u.id },
      orderBy: { id: "asc" },
      select: { expiresAt: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(rows[1]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("POST /api/v1/auth/reset-password", () => {
  it("sets a cost-12 hash, consumes the token, and evicts every session, other reset and live invite (R79 fixed)", async () => {
    const u = await createTestUser("reset-ok", "STUDENT");
    const signIn = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD });
    const oldRefresh = signIn.body.data.refreshToken as string;
    await issueInvite(db, u.id, superUser.id); // a live invite that must not survive
    const raw = await mintReset(u.id);
    // A second live reset token, written directly (issuePasswordReset would
    // have expired the first): the reset must consume it too.
    const other = await db.passwordResetToken.create({
      data: {
        token: hashToken(randomBytes(32).toString("hex")),
        userId: u.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });

    const row = await db.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12 (spec 11 D8)

    const used = await db.passwordResetToken.findUnique({ where: { token: hashToken(raw) }, select: { usedAt: true } });
    expect(used?.usedAt).not.toBeNull();
    const otherRow = await db.passwordResetToken.findUnique({ where: { id: other.id }, select: { expiresAt: true } });
    expect(otherRow!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(
      await db.inviteToken.count({ where: { userId: u.id, usedAt: null, expiresAt: { gt: new Date() } } }),
    ).toBe(0);

    // The old session is dead: rotation of the pre-reset refresh token 401s.
    const rotate = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: oldRefresh });
    expect(rotate.status).toBe(401);

    // New password in, old password out.
    expect(
      (await request(app).post("/api/v1/auth/login").send({ email: u.email, password: "brand-new-password" })).status,
    ).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD })).status).toBe(401);
  });

  it("is single-use", async () => {
    const u = await createTestUser("reset-once", "STUDENT");
    const raw = await mintReset(u.id);
    await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "brand-new-password" });
    const again = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: raw, password: "another-password-1" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_reset_token");
  });

  it("refuses expired, unknown and deleted-account tokens with one byte-identical body (R77/R78 closed)", async () => {
    const expiredUser = await createTestUser("reset-expired", "STUDENT");
    const expired = await mintReset(expiredUser.id);
    await db.passwordResetToken.updateMany({
      where: { token: hashToken(expired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const goneUser = await createTestUser("reset-gone", "STUDENT");
    const gone = await mintReset(goneUser.id);
    await db.user.update({ where: { id: goneUser.id }, data: { deletedAt: new Date() } });

    const bodies = [];
    for (const token of [expired, randomBytes(32).toString("hex"), gone]) {
      const res = await request(app).post("/api/v1/auth/reset-password").send({ token, password: "brand-new-password" });
      expect(res.status).toBe(400);
      bodies.push(res.body);
    }
    expect(bodies[0].error.code).toBe("invalid_reset_token");
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it("accepts a token minted the way v1 mints them — the two backends interoperate (Decision 9)", async () => {
    const u = await createTestUser("reset-v1-format", "STUDENT");
    // Exactly jpc-space/src/lib/auth/password-reset.ts:19-29.
    const v1Raw = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: {
        token: createHash("sha256").update(v1Raw).digest("hex"),
        userId: u.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: v1Raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
  });

  it("activates a never-activated account (v1 parity, R70) and retires its live invite", async () => {
    const fresh = await createUnactivatedTestUser("reset-unactivated", "STUDENT");
    await issueInvite(db, fresh.id, superUser.id);
    const raw = await mintReset(fresh.id);

    const res = await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(200);
    expect(
      (await request(app).post("/api/v1/auth/login").send({ email: fresh.email, password: "brand-new-password" })).status,
    ).toBe(200);
    expect(
      await db.inviteToken.count({ where: { userId: fresh.id, usedAt: null, expiresAt: { gt: new Date() } } }),
    ).toBe(0);
  });

  it("validates the password before touching the token — a weak password consumes nothing", async () => {
    const u = await createTestUser("reset-weak", "STUDENT");
    const raw = await mintReset(u.id);
    const res = await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
    const row = await db.passwordResetToken.findUnique({ where: { token: hashToken(raw) }, select: { usedAt: true } });
    expect(row?.usedAt).toBeNull();
  });
});

describe("POST /api/v1/me/password consumes outstanding reset tokens (spec 18 R29, Decision 14)", () => {
  it("a token minted before a password change no longer works after it", async () => {
    const u = await createTestUser("change-then-reset", "STUDENT");
    const raw = await mintReset(u.id);
    const change = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${await login(app, u.email)}`)
      .send({ currentPassword: PASSWORD, newPassword: "changed-password-1" });
    expect(change.status).toBe(200);

    const res = await request(app).post("/api/v1/auth/reset-password").send({ token: raw, password: "brand-new-password" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reset_token");
  });
});
