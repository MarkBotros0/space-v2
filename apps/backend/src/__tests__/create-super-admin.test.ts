import bcrypt from "bcryptjs";

const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
jest.mock("../db/client", () => ({
  db: {
    user: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
  },
}));

import { createSuperAdmin } from "../../scripts/create-super-admin/create";

const input = { email: "  Owner@JPC.test ", name: " Owner ", password: "correct horse" };

beforeEach(() => {
  jest.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockCreate.mockImplementation(async ({ data }: { data: { email: string } }) => ({
    id: 1,
    email: data.email,
  }));
});

describe("createSuperAdmin", () => {
  it("creates a SUPER with a lowercased email, trimmed name and a bcrypt hash", async () => {
    await expect(createSuperAdmin(input)).resolves.toEqual({
      ok: true,
      id: 1,
      email: "owner@jpc.test",
    });
    const { data } = mockCreate.mock.calls[0][0];
    expect(data).toMatchObject({ email: "owner@jpc.test", name: "Owner", role: "SUPER" });
    expect(data.passwordHash).not.toContain("correct horse");
    await expect(bcrypt.compare("correct horse", data.passwordHash)).resolves.toBe(true);
  });

  it("checks for an existing account case-insensitively", async () => {
    await createSuperAdmin(input);
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "owner@jpc.test" },
      }),
    );
  });

  it("refuses an address that already exists, without writing", async () => {
    mockFindFirst.mockResolvedValue({ id: 7 });
    await expect(createSuperAdmin(input)).resolves.toEqual({
      ok: false,
      error: "An account for owner@jpc.test already exists.",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...input, email: "not-an-email" }, "Must be a valid email."],
    [{ ...input, name: "   " }, "Name is required."],
    [{ ...input, password: "short" }, "At least 8 characters."],
    [{ ...input, password: "x".repeat(73) }, "At most 72 bytes."],
  ])("rejects invalid input without touching the database (%#)", async (bad, message) => {
    const result = await createSuperAdmin(bad);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain(message);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
