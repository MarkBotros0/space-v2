/** DELETE /me — the account holder deletes their own account. */
const tx = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  studentProfile: { updateMany: jest.fn() },
  deviceToken: { deleteMany: jest.fn() },
};
const mockDb = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
jest.mock("../db/client", () => ({ db: mockDb }));
jest.mock("../lib/auth/session-validity", () => ({
  isAccessTokenInvalidated: async () => false,
  invalidateSessions: jest.fn(),
}));
jest.mock("../lib/super-guard", () => ({
  lockActiveSuperIds: jest.fn(),
  isLastActiveSuper: jest.fn(),
}));
jest.mock("../lib/auth/tokens", () => ({
  ...jest.requireActual("../lib/auth/tokens"),
  revokeAllRefreshTokensForUser: jest.fn(),
}));

import request from "supertest";

import { createApp } from "../app";
import { invalidateSessions } from "../lib/auth/session-validity";
import { revokeAllRefreshTokensForUser, signAccessToken } from "../lib/auth/tokens";
import { isLastActiveSuper, lockActiveSuperIds } from "../lib/super-guard";

const app = createApp();
const tokenFor = async (role: "STUDENT" | "SUPER") =>
  (
    await signAccessToken({
      userId: 7,
      role,
      seasonAdminIds: [],
      groupLeaderIds: [],
      activeSeasonId: null,
      graduationYear: null,
    })
  ).token;

beforeEach(() => {
  jest.clearAllMocks();
  tx.user.findUnique.mockResolvedValue({ role: "STUDENT", deletedAt: null });
});

describe("DELETE /api/v1/me", () => {
  it("soft-deletes the caller, drops their devices and ends every session", async () => {
    const res = await request(app)
      .delete("/api/v1/me")
      .set({ authorization: `Bearer ${await tokenFor("STUDENT")}` });
    expect(res.status).toBe(200);
    expect(res.body.data.deletedAt).toEqual(expect.any(String));
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { deletedAt: expect.any(Date) } });
    expect(tx.studentProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(revokeAllRefreshTokensForUser).toHaveBeenCalledWith(tx, 7);
    expect(invalidateSessions).toHaveBeenCalledWith(tx, 7);
  });

  it("refuses the last active SUPER", async () => {
    tx.user.findUnique.mockResolvedValue({ role: "SUPER", deletedAt: null });
    (lockActiveSuperIds as jest.Mock).mockResolvedValue([7]);
    (isLastActiveSuper as jest.Mock).mockReturnValue(true);
    const res = await request(app)
      .delete("/api/v1/me")
      .set({ authorization: `Bearer ${await tokenFor("SUPER")}` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("last_super");
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("needs a signed-in caller", async () => {
    const res = await request(app).delete("/api/v1/me");
    expect(res.status).toBe(401);
  });
});
