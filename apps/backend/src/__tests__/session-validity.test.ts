/**
 * Plan 18 M13 with the database mocked: requireAuth refuses an access token
 * issued before User.sessionsValidFrom, and logout-all and password change
 * write it in the same transaction as the refresh-token revocation. (Role
 * change and deactivation: users-accounts-unit; reset: password-reset-unit;
 * student soft delete: below.)
 */
const mockDb = {
  user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  studentProfile: { updateMany: jest.fn() },
  passwordResetToken: { updateMany: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../db/client", () => ({ db: mockDb }));

import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";

import { createApp } from "../app";
import { invalidateSessions, isAccessTokenInvalidated, issuedBeforeCutoff } from "../lib/auth/session-validity";
import { signAccessToken, type SessionUser } from "../lib/auth/tokens";
import { requireAuth } from "../middleware/require-auth";

const student: SessionUser = {
  userId: 7,
  role: "STUDENT",
  seasonAdminIds: [],
  groupLeaderIds: [],
  activeSeasonId: null,
  graduationYear: null,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
  mockDb.user.update.mockResolvedValue({ id: 7 });
  mockDb.refreshToken.updateMany.mockResolvedValue({ count: 2 });
  mockDb.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
});

describe("issuedBeforeCutoff", () => {
  const cutoff = new Date("2026-11-05T10:00:00.700Z"); // part-way through a second
  const second = Math.floor(cutoff.getTime() / 1000);

  it("never refuses when nothing was invalidated", () => {
    expect(issuedBeforeCutoff(0, null)).toBe(false);
  });

  it("refuses a token from an earlier second", () => {
    expect(issuedBeforeCutoff(second - 1, cutoff)).toBe(true);
    expect(issuedBeforeCutoff(0, cutoff)).toBe(true); // a token without iat counts as oldest
  });

  it("admits a token from the same or a later second (the client's own refresh)", () => {
    expect(issuedBeforeCutoff(second, cutoff)).toBe(false);
    expect(issuedBeforeCutoff(second + 1, cutoff)).toBe(false);
  });
});

describe("isAccessTokenInvalidated / invalidateSessions", () => {
  it("reads one column by primary key", async () => {
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: new Date(10_000) });
    await expect(isAccessTokenInvalidated(7, 9)).resolves.toBe(true);
    await expect(isAccessTokenInvalidated(7, 10)).resolves.toBe(false);
    expect(mockDb.user.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { sessionsValidFrom: true } });
  });

  it("treats an unknown user like one with nothing invalidated (unchanged behaviour)", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    await expect(isAccessTokenInvalidated(7, 0)).resolves.toBe(false);
  });

  it("stamps sessionsValidFrom", async () => {
    const at = new Date("2026-11-05T10:00:00Z");
    await invalidateSessions(mockDb as never, 7, at);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { sessionsValidFrom: at },
      select: { id: true },
    });
  });
});

describe("requireAuth", () => {
  const probe = express();
  probe.get("/probe", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  async function tokenIssuedAt(): Promise<{ token: string; iat: number }> {
    const { token } = await signAccessToken(student);
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { iat: number };
    return { token, iat: payload.iat };
  }

  it("refuses a token issued before sessionsValidFrom with the ordinary 401", async () => {
    const { token, iat } = await tokenIssuedAt();
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: new Date((iat + 1) * 1000) });
    const res = await request(probe).get("/probe").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("admits a token issued in or after the invalidation's second, and hides iat from handlers", async () => {
    const { token, iat } = await tokenIssuedAt();
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: new Date(iat * 1000 + 999) });
    const res = await request(probe).get("/probe").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(student);
  });

  it("admits any valid token while nothing has been invalidated", async () => {
    const { token } = await tokenIssuedAt();
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: null });
    expect((await request(probe).get("/probe").set("authorization", `Bearer ${token}`)).status).toBe(200);
  });

  it("never reads the database for a token that fails verification", async () => {
    const res = await request(probe).get("/probe").set("authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("writers", () => {
  const app = createApp();
  let token: string;
  beforeEach(async () => {
    ({ token } = await signAccessToken(student));
  });

  function stampedFor(userId: number): boolean {
    return mockDb.user.update.mock.calls.some(
      ([arg]: [{ where: { id: number }; data: Record<string, unknown> }]) =>
        arg.where.id === userId && arg.data.sessionsValidFrom instanceof Date,
    );
  }

  it("logout-all revokes the refresh tokens and stamps sessionsValidFrom in one transaction", async () => {
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: null });
    const res = await request(app).post("/api/v1/auth/logout-all").set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revoked: 2 });
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(stampedFor(7)).toBe(true);
  });

  it("password change stamps sessionsValidFrom and still spares the presented refresh token", async () => {
    const passwordHash = await bcrypt.hash("OldPassw0rd!", 4);
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: null, passwordHash });
    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${token}`)
      .send({ currentPassword: "OldPassw0rd!", newPassword: "NewPassw0rd!2", refreshToken: "this-device" });
    expect(res.status).toBe(200);
    expect(stampedFor(7)).toBe(true);
    expect(mockDb.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 7, tokenHash: { not: expect.any(String) } }),
      }),
    );
  });

  it("a refused current password stamps nothing", async () => {
    const passwordHash = await bcrypt.hash("OldPassw0rd!", 4);
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: null, passwordHash });
    const res = await request(app)
      .post("/api/v1/me/password")
      .set("authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong", newPassword: "NewPassw0rd!2" });
    expect(res.status).toBe(400);
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("a student soft delete stamps the student's sessionsValidFrom", async () => {
    const { token: superToken } = await signAccessToken({ ...student, userId: 1, role: "SUPER" });
    mockDb.user.findUnique.mockResolvedValue({ sessionsValidFrom: null });
    mockDb.user.updateMany.mockResolvedValue({ count: 1 });
    mockDb.studentProfile.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).delete("/api/v1/students/7").set("authorization", `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(stampedFor(7)).toBe(true);
  });
});
