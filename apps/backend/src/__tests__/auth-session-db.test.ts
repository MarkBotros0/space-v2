const mockDb = {
  user: { findUnique: jest.fn() },
  seasonAdmin: { findMany: jest.fn() },
  groupLeader: { findMany: jest.fn() },
  seasonEnrollment: { findMany: jest.fn() },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};
jest.mock("../db/client", () => ({ db: mockDb }));

import { deriveRole, loadScopes } from "../lib/auth/scopes";
import {
  hashToken,
  issueSession,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyAccessToken,
} from "../lib/auth/tokens";

function stubScopes() {
  const season = { status: "ACTIVE" };
  mockDb.seasonAdmin.findMany.mockResolvedValue([
    { userId: 5, seasonId: 3, season },
    { userId: 5, seasonId: 4, season },
  ]);
  mockDb.groupLeader.findMany.mockResolvedValue([{ userId: 5, groupId: 8, group: { season } }]);
  mockDb.seasonEnrollment.findMany.mockResolvedValue([{ studentUserId: 5, seasonId: 3 }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.refreshToken.create.mockResolvedValue({});
  mockDb.refreshToken.update.mockResolvedValue({});
  mockDb.refreshToken.updateMany.mockResolvedValue({ count: 2 });
  mockDb.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe("deriveRole", () => {
  const none = { adminIds: [], leaderIds: [] };
  it.each([
    ["SUPER", { adminIds: [1], leaderIds: [2] }, "SUPER"],
    ["MENTOR", { adminIds: [1], leaderIds: [2] }, "MENTOR"],
    ["STUDENT", { adminIds: [1], leaderIds: [2] }, "ADMIN"],
    ["LEADER", { adminIds: [1], leaderIds: [] }, "ADMIN"],
    ["ADMIN", { adminIds: [], leaderIds: [2] }, "LEADER"],
    ["ADMIN", none, "STUDENT"],
    ["LEADER", none, "STUDENT"],
    ["STUDENT", none, "STUDENT"],
  ] as const)("stored %s with %j is %s", (stored, grants, expected) => {
    expect(deriveRole(stored, { adminIds: [...grants.adminIds], leaderIds: [...grants.leaderIds] })).toBe(expected);
  });
});

describe("loadScopes", () => {
  it("flattens admin/leader rows and reads the current season and graduation year", async () => {
    stubScopes();
    mockDb.user.findUnique.mockResolvedValue({ role: "STUDENT", graduationYear: 2030 });
    await expect(loadScopes(5)).resolves.toEqual({
      role: "ADMIN",
      seasonAdminIds: [3, 4],
      groupLeaderIds: [8],
      activeSeasonId: 3,
      graduationYear: 2030,
    });
  });

  it("falls back to STUDENT and nulls when the account row is missing", async () => {
    mockDb.seasonAdmin.findMany.mockResolvedValue([]);
    mockDb.groupLeader.findMany.mockResolvedValue([]);
    mockDb.seasonEnrollment.findMany.mockResolvedValue([]);
    mockDb.user.findUnique.mockResolvedValue(null);
    await expect(loadScopes(1)).resolves.toEqual({
      role: "STUDENT",
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: null,
      graduationYear: null,
    });
  });

  it("reads no season rows for a SUPER or MENTOR", async () => {
    mockDb.user.findUnique.mockResolvedValue({ role: "MENTOR", graduationYear: null });
    await expect(loadScopes(1)).resolves.toMatchObject({ role: "MENTOR", seasonAdminIds: [] });
    expect(mockDb.seasonAdmin.findMany).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce({ id: 5, deletedAt: null })
      .mockResolvedValueOnce({ role: "STUDENT", graduationYear: null });
    const issued = await issueSession(5);
    expect(issued).not.toBeNull();
    expect(issued!.user).toMatchObject({ userId: 5, role: "ADMIN", groupLeaderIds: [8] });
    await expect(verifyAccessToken(issued!.session.accessToken)).resolves.toMatchObject({ userId: 5 });

    const data = mockDb.refreshToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashToken(issued!.session.refreshToken));
    expect(data.tokenHash).not.toBe(issued!.session.refreshToken);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("rotateRefreshToken", () => {
  const future = new Date(Date.now() + 60_000);

  it.each([
    ["unknown token", null],
    ["revoked token", { id: 1, userId: 5, revokedAt: new Date(), expiresAt: future }],
    ["expired token", { id: 1, userId: 5, revokedAt: null, expiresAt: new Date(Date.now() - 1000) }],
  ])("rejects a %s and deletes nothing", async (_l, record) => {
    mockDb.refreshToken.findUnique.mockResolvedValue(record);
    await expect(rotateRefreshToken("raw")).resolves.toBeNull();
    expect(mockDb.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("returns null when a concurrent refresh already consumed the token", async () => {
    mockDb.refreshToken.findUnique.mockResolvedValue({ id: 1, userId: 5, revokedAt: null, expiresAt: future });
    mockDb.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    await expect(rotateRefreshToken("raw")).resolves.toBeNull();
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  it("deletes the old token, then every other token the person holds, and returns a new session", async () => {
    stubScopes();
    mockDb.refreshToken.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 3 });
    mockDb.refreshToken.findUnique.mockResolvedValue({ id: 1, userId: 5, revokedAt: null, expiresAt: future });
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: 5, deletedAt: null })
      .mockResolvedValueOnce({ role: "STUDENT", graduationYear: null });
    const session = await rotateRefreshToken("raw");
    expect(mockDb.refreshToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashToken("raw") } });
    expect(mockDb.refreshToken.deleteMany).toHaveBeenNthCalledWith(1, { where: { id: 1, revokedAt: null } });
    // One device per person: everything but the new token goes, live or not.
    expect(mockDb.refreshToken.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 5, tokenHash: { not: hashToken(session!.refreshToken) } },
    });
    expect(mockDb.refreshToken.updateMany).not.toHaveBeenCalled();
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

  it("revokeAllRefreshTokensForUser revokes every live token and returns the count", async () => {
    await expect(revokeAllRefreshTokensForUser(mockDb as never, 5)).resolves.toBe(2);
    expect(mockDb.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ userId: 5, revokedAt: null });
  });
});
