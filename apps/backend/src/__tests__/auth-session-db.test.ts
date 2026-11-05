const mockDb = {
  user: { findUnique: jest.fn() },
  seasonAdmin: { findMany: jest.fn() },
  groupLeader: { findMany: jest.fn() },
  studentProfile: { findUnique: jest.fn() },
  refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};
jest.mock("../db/client", () => ({ db: mockDb }));

import { loadScopes } from "../lib/auth/scopes";
import {
  hashToken,
  issueSession,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyAccessToken,
} from "../lib/auth/tokens";

function stubScopes() {
  mockDb.seasonAdmin.findMany.mockResolvedValue([{ seasonId: 3 }, { seasonId: 4 }]);
  mockDb.groupLeader.findMany.mockResolvedValue([{ groupId: 8 }]);
  mockDb.studentProfile.findUnique.mockResolvedValue({ activeSeasonId: 3 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.refreshToken.create.mockResolvedValue({});
  mockDb.refreshToken.update.mockResolvedValue({});
  mockDb.refreshToken.updateMany.mockResolvedValue({ count: 2 });
});

describe("loadScopes", () => {
  it("flattens admin/leader rows and reads the profile and graduation year", async () => {
    stubScopes();
    mockDb.user.findUnique.mockResolvedValue({ graduationYear: 2030 });
    await expect(loadScopes(1)).resolves.toEqual({
      seasonAdminIds: [3, 4], groupLeaderIds: [8], activeSeasonId: 3, graduationYear: 2030,
    });
  });

  it("falls back to null when the profile or account row is missing", async () => {
    mockDb.seasonAdmin.findMany.mockResolvedValue([]);
    mockDb.groupLeader.findMany.mockResolvedValue([]);
    mockDb.studentProfile.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue(null);
    await expect(loadScopes(1)).resolves.toEqual({
      seasonAdminIds: [], groupLeaderIds: [], activeSeasonId: null, graduationYear: null,
    });
  });
});

describe("hashToken", () => {
  it("is deterministic sha256 hex and never the raw value", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("issueSession", () => {
  it("returns null for an unknown or deleted user and issues nothing", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce(null);
    await expect(issueSession(1)).resolves.toBeNull();
    mockDb.user.findUnique.mockResolvedValueOnce({ id: 1, role: "STUDENT", deletedAt: new Date() });
    await expect(issueSession(1)).resolves.toBeNull();
    expect(mockDb.refreshToken.create).not.toHaveBeenCalled();
  });

  it("issues a verifiable access token and stores only the refresh token's hash", async () => {
    stubScopes();
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: 5, role: "LEADER", deletedAt: null })
      .mockResolvedValueOnce({ graduationYear: null });
    const issued = await issueSession(5, "jest-agent");
    expect(issued).not.toBeNull();
    expect(issued!.user).toMatchObject({ userId: 5, role: "LEADER", groupLeaderIds: [8] });
    await expect(verifyAccessToken(issued!.session.accessToken)).resolves.toMatchObject({ userId: 5 });

    const data = mockDb.refreshToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashToken(issued!.session.refreshToken));
    expect(data.tokenHash).not.toBe(issued!.session.refreshToken);
    expect(data.userAgent).toBe("jest-agent");
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("stores a null user agent when none is given", async () => {
    stubScopes();
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: 5, role: "STUDENT", deletedAt: null })
      .mockResolvedValueOnce({ graduationYear: null });
    await issueSession(5);
    expect(mockDb.refreshToken.create.mock.calls[0][0].data.userAgent).toBeNull();
  });
});

describe("rotateRefreshToken", () => {
  const future = new Date(Date.now() + 60_000);

  it.each([
    ["unknown token", null],
    ["revoked token", { id: 1, userId: 5, revokedAt: new Date(), expiresAt: future }],
    ["expired token", { id: 1, userId: 5, revokedAt: null, expiresAt: new Date(Date.now() - 1000) }],
  ])("rejects a %s and revokes nothing", async (_l, record) => {
    mockDb.refreshToken.findUnique.mockResolvedValue(record);
    await expect(rotateRefreshToken("raw")).resolves.toBeNull();
    expect(mockDb.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("returns null when a concurrent refresh already revoked the token", async () => {
    mockDb.refreshToken.findUnique.mockResolvedValue({ id: 1, userId: 5, revokedAt: null, expiresAt: future });
    mockDb.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(rotateRefreshToken("raw")).resolves.toBeNull();
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  it("revokes the old token and returns a new session", async () => {
    stubScopes();
    mockDb.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockDb.refreshToken.findUnique.mockResolvedValue({ id: 1, userId: 5, revokedAt: null, expiresAt: future });
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: 5, role: "STUDENT", deletedAt: null })
      .mockResolvedValueOnce({ graduationYear: null });
    const session = await rotateRefreshToken("raw");
    expect(mockDb.refreshToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashToken("raw") } });
    expect(mockDb.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 1, revokedAt: null }, data: { revokedAt: expect.any(Date) },
    });
    expect(session?.refreshToken).toEqual(expect.any(String));
  });

  it("returns null if the user was deleted after the token was issued", async () => {
    mockDb.refreshToken.findUnique.mockResolvedValue({ id: 1, userId: 5, revokedAt: null, expiresAt: future });
    mockDb.user.findUnique.mockResolvedValue({ id: 5, role: "STUDENT", deletedAt: new Date() });
    await expect(rotateRefreshToken("raw")).resolves.toBeNull();
  });
});

describe("revoking", () => {
  it("revokeRefreshToken only touches the still-live row for that hash", async () => {
    await revokeRefreshToken("raw");
    expect(mockDb.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("raw"), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("revokeAllRefreshTokensForUser returns the count and can spare one session", async () => {
    await expect(revokeAllRefreshTokensForUser(mockDb as never, 5)).resolves.toBe(2);
    expect(mockDb.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ userId: 5, revokedAt: null });

    await revokeAllRefreshTokensForUser(mockDb as never, 5, "keepme");
    expect(mockDb.refreshToken.updateMany.mock.calls[1][0].where).toEqual({
      userId: 5, revokedAt: null, tokenHash: { not: "keepme" },
    });
  });
});
