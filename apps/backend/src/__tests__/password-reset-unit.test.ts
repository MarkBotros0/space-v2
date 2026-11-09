const mockDb = {
  user: { findUnique: jest.fn(), findMany: jest.fn(async () => []), update: jest.fn() },
  passwordResetToken: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  inviteToken: { updateMany: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};
const mockIsEmailConfigured = jest.fn();
const mockSendResetEmail = jest.fn();
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/email", () => ({
  isEmailConfigured: () => mockIsEmailConfigured(),
  sendPasswordResetEmail: (...a: unknown[]) => mockSendResetEmail(...a),
}));

import bcrypt from "bcryptjs";

import {
  completePasswordReset,
  expireLiveResetTokens,
  issuePasswordReset,
  PASSWORD_RESET_TTL_MS,
  requestPasswordReset,
} from "../lib/auth/password-reset";
import { hashToken } from "../lib/auth/tokens";

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
  mockDb.user.findMany.mockResolvedValue([]);
  mockDb.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
  mockDb.passwordResetToken.create.mockResolvedValue({});
  mockDb.inviteToken.updateMany.mockResolvedValue({ count: 0 });
  mockDb.refreshToken.updateMany.mockResolvedValue({ count: 0 });
  mockDb.user.update.mockResolvedValue({});
});

describe("expireLiveResetTokens / issuePasswordReset", () => {
  it("expires only live, unused tokens and returns the count", async () => {
    const now = new Date("2099-01-01T00:00:00Z");
    mockDb.passwordResetToken.updateMany.mockResolvedValue({ count: 3 });
    await expect(expireLiveResetTokens(mockDb as never, 7, now)).resolves.toBe(3);
    expect(mockDb.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
  });

  it("mints a 64-hex token, stores only its hash, and expires prior tokens first", async () => {
    const { raw, expiresAt } = await issuePasswordReset(mockDb as never, 7);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(mockDb.passwordResetToken.updateMany).toHaveBeenCalledTimes(1);
    const data = mockDb.passwordResetToken.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ token: hashToken(raw), userId: 7 });
    expect(data.token).not.toBe(raw);
    expect(Math.abs(expiresAt.getTime() - (Date.now() + PASSWORD_RESET_TTL_MS))).toBeLessThan(5000);
    const expireOrder = mockDb.passwordResetToken.updateMany.mock.invocationCallOrder[0] ?? Infinity;
    const createOrder = mockDb.passwordResetToken.create.mock.invocationCallOrder[0] ?? -1;
    expect(expireOrder).toBeLessThan(createOrder);
  });
});

describe("requestPasswordReset", () => {
  const user = { id: 7, email: "s@jpc.test", deletedAt: null };

  beforeEach(() => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockDb.user.findUnique.mockResolvedValue(user);
    mockDb.passwordResetToken.findFirst.mockResolvedValue(null);
    mockSendResetEmail.mockResolvedValue(undefined);
  });

  it("mints nothing when email isn't configured", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    await requestPasswordReset("s@jpc.test");
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown account", null],
    ["deleted account", { ...user, deletedAt: new Date() }],
  ])("is silent for an %s", async (_l, found) => {
    mockDb.user.findUnique.mockResolvedValue(found);
    await expect(requestPasswordReset("s@jpc.test")).resolves.toBeUndefined();
    expect(mockSendResetEmail).not.toHaveBeenCalled();
  });

  it("respects the per-account cooldown", async () => {
    mockDb.passwordResetToken.findFirst.mockResolvedValue({ id: 1 });
    await requestPasswordReset("s@jpc.test");
    expect(mockSendResetEmail).not.toHaveBeenCalled();
    expect(mockDb.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("mails the raw code once for a real account", async () => {
    await requestPasswordReset("s@jpc.test");
    expect(mockSendResetEmail).toHaveBeenCalledWith(
      "s@jpc.test",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Date),
    );
  });

  it("swallows and logs a transport failure without leaking the address or code", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockSendResetEmail.mockRejectedValue(new Error("smtp down"));
    await expect(requestPasswordReset("s@jpc.test")).resolves.toBeUndefined();
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("smtp down");
    expect(logged).not.toContain("s@jpc.test");
    spy.mockRestore();
  });
});

describe("completePasswordReset", () => {
  const live = {
    id: 1,
    userId: 7,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { deletedAt: null },
  };

  it.each([
    ["unknown token", null],
    ["used token", { ...live, usedAt: new Date() }],
    ["expired token", { ...live, expiresAt: new Date(Date.now() - 1000) }],
    ["deleted user", { ...live, user: { deletedAt: new Date() } }],
  ])("returns invalid for a %s and writes nothing", async (_l, record) => {
    mockDb.passwordResetToken.findUnique.mockResolvedValue(record);
    await expect(completePasswordReset("raw", "NewPassw0rd!")).resolves.toBe("invalid");
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("returns invalid if a concurrent submission consumed the token first", async () => {
    mockDb.passwordResetToken.findUnique.mockResolvedValue(live);
    mockDb.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(completePasswordReset("raw", "NewPassw0rd!")).resolves.toBe("invalid");
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("sets a bcrypt hash, expires other reset/invite tokens and revokes every session", async () => {
    mockDb.passwordResetToken.findUnique.mockResolvedValue(live);
    await expect(completePasswordReset("raw", "NewPassw0rd!")).resolves.toBe("ok");
    expect(mockDb.passwordResetToken.findUnique.mock.calls[0][0].where).toEqual({ token: hashToken("raw") });
    const { passwordHash } = mockDb.user.update.mock.calls[0][0].data;
    expect(passwordHash).not.toBe("NewPassw0rd!");
    expect(await bcrypt.compare("NewPassw0rd!", passwordHash)).toBe(true);
    expect(mockDb.inviteToken.updateMany).toHaveBeenCalled();
    expect(mockDb.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7, revokedAt: null } }),
    );
    // Plan 18 M13: live access tokens end too, stamped with the reset's instant.
    const stamp = mockDb.user.update.mock.calls.find(([a]) => "sessionsValidFrom" in a.data);
    expect(stamp?.[0]).toEqual({
      where: { id: 7 },
      data: { sessionsValidFrom: expect.any(Date) },
      select: { id: true },
    });
  });
});
