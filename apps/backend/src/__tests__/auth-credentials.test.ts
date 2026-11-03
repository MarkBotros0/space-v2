import bcrypt from "bcryptjs";

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
jest.mock("../db/client", () => ({
  db: { user: { findUnique: (...a: unknown[]) => mockFindUnique(...a), update: (...a: unknown[]) => mockUpdate(...a) } },
}));

import { verifyCredentials } from "../lib/auth/credentials";

const hash = bcrypt.hashSync("correct horse", 4);
const row = { id: 9, email: "a@jpc.test", name: "Ann", role: "LEADER", deletedAt: null, passwordHash: hash };

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({});
});

describe("verifyCredentials", () => {
  it("returns the public user fields and stamps lastLoginAt on success", async () => {
    mockFindUnique.mockResolvedValue(row);
    await expect(verifyCredentials("a@jpc.test", "correct horse")).resolves.toEqual({
      id: 9, email: "a@jpc.test", name: "Ann", role: "LEADER",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it("never leaks the hash in the result", async () => {
    mockFindUnique.mockResolvedValue(row);
    const result = await verifyCredentials("a@jpc.test", "correct horse");
    expect(result).not.toHaveProperty("passwordHash");
  });

  it.each([
    ["unknown email", null],
    ["soft-deleted account", { ...row, deletedAt: new Date() }],
    ["invite not yet accepted (no hash)", { ...row, passwordHash: null }],
  ])("returns null for %s without touching lastLoginAt", async (_label, found) => {
    mockFindUnique.mockResolvedValue(found);
    await expect(verifyCredentials("a@jpc.test", "correct horse")).resolves.toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns null for a wrong password without touching lastLoginAt", async () => {
    mockFindUnique.mockResolvedValue(row);
    await expect(verifyCredentials("a@jpc.test", "wrong")).resolves.toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
