import bcrypt from "bcryptjs";

const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockUpdate = jest.fn();
jest.mock("../db/client", () => ({
  db: {
    user: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));

import { verifyCredentials } from "../lib/auth/credentials";

const hash = bcrypt.hashSync("correct horse", 4);
const row = { id: 9, email: "a@jpc.test", name: "Ann", deletedAt: null, passwordHash: hash };

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({});
  mockFindMany.mockResolvedValue([]);
});

describe("verifyCredentials", () => {
  it("returns the public user fields and stamps lastLoginAt on success", async () => {
    mockFindUnique.mockResolvedValue(row);
    await expect(verifyCredentials("a@jpc.test", "correct horse")).resolves.toEqual({
      id: 9,
      email: "a@jpc.test",
      name: "Ann",
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

describe("verifyCredentials email matching", () => {
  it("falls back to a unique case-insensitive match when there is no exact one", async () => {
    const hash = await bcrypt.hash("pw-123456", 4);
    mockFindUnique.mockResolvedValueOnce(null);
    mockFindMany.mockResolvedValueOnce([
      { id: 3, email: "foo@x.com", name: "Foo", role: "STUDENT", deletedAt: null, passwordHash: hash },
    ]);
    const user = await verifyCredentials("Foo@x.com", "pw-123456");
    expect(user?.email).toBe("foo@x.com");
  });

  it("refuses an ambiguous case-insensitive match", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockFindMany.mockResolvedValueOnce([{ id: 3 }, { id: 4 }]);
    await expect(verifyCredentials("Foo@x.com", "pw")).resolves.toBeNull();
  });
});
