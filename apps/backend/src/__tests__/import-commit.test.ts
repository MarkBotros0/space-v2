// apps/backend/src/__tests__/import-commit.test.ts
//
// A unit test with the database module mocked. It makes the assertions the
// integration suite structurally cannot: that commitStudentImport is v1's
// per-row loop (`jpc-space/src/lib/student-import.ts:238-291`, D-16.5) — every
// created row's writes go through ITS OWN $transaction, on the transaction
// client and never on db itself, and a throw inside one row's transaction
// does not stop the rows after it (R45, R53). Moving every row into one
// shared $transaction (Task 7 mutation 3) turns the first case red.

import { Prisma } from "../generated/prisma/client";

const mockTx = {
  user: { createManyAndReturn: jest.fn() },
  studentProfile: { createMany: jest.fn() },
  seasonEnrollment: { createMany: jest.fn() },
};
const mockDb = {
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  user: { createManyAndReturn: jest.fn(), create: jest.fn() },
  studentProfile: { createMany: jest.fn() },
  seasonEnrollment: { createMany: jest.fn() },
};

jest.mock("../db/client", () => ({ db: mockDb }));

import { commitStudentImport } from "../lib/imports/students";

const values = (name: string, email: string) => ({
  name, email,
  university: null, year: null, phone: null, dateOfBirth: null,
  spiritualBackground: null, gifts: null, notes: null,
});

let nextId = 100;

beforeEach(() => {
  jest.clearAllMocks();
  nextId = 100;
  mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));
  mockDb.$queryRaw.mockResolvedValue([]); // nobody exists yet
  mockTx.user.createManyAndReturn.mockImplementation(async ({ data }: { data: { email: string }[] }) =>
    data.map((d) => ({ id: nextId++, email: d.email })),
  );
  mockTx.studentProfile.createMany.mockResolvedValue({ count: 1 });
  mockTx.seasonEnrollment.createMany.mockResolvedValue({ count: 1 });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("commitStudentImport", () => {
  it("writes each row in its own transaction, on the transaction client only", async () => {
    const result = await commitStudentImport(
      [
        { rowNumber: 2, values: values("A Student", "space-v2-test-a@jpc.test") },
        { rowNumber: 3, values: values("B Student", "space-v2-test-b@jpc.test") },
      ],
      { kind: "season", seasonId: 7 },
    );

    expect(result.created).toBe(2);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(2);
    expect(mockTx.user.createManyAndReturn).toHaveBeenCalledTimes(2);
    for (const call of mockTx.user.createManyAndReturn.mock.calls) {
      expect(call[0].data).toHaveLength(1);
    }
    expect(mockTx.seasonEnrollment.createMany).toHaveBeenCalledTimes(2);
    expect(mockDb.user.createManyAndReturn).not.toHaveBeenCalled();
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.studentProfile.createMany).not.toHaveBeenCalled();
    expect(mockDb.seasonEnrollment.createMany).not.toHaveBeenCalled();
  });

  it("a throw inside row 2's transaction does not stop row 3 (R45, R53)", async () => {
    mockTx.studentProfile.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ count: 1 });

    const result = await commitStudentImport(
      [
        { rowNumber: 2, values: values("One", "space-v2-test-1@jpc.test") },
        { rowNumber: 3, values: values("Two", "space-v2-test-2@jpc.test") },
        { rowNumber: 4, values: values("Three", "space-v2-test-3@jpc.test") },
      ],
      { kind: "alumni", graduationYear: 2020 },
    );

    expect(result.rows.map((r) => r.outcome)).toEqual(["created", "failed", "created"]);
    expect(result.rows[1]?.message).toBe("Could not create this account.");
    expect(result).toMatchObject({ created: 2, skipped: 0, failed: 1 });
    // Logged by row number, never by address (D-16.18).
    const logged = (console.error as jest.Mock).mock.calls.flat().join(" ");
    expect(logged).toContain("row 3");
    expect(logged).not.toContain("space-v2-test-2@jpc.test");
  });

  it("reports an invalid row failed and carries on (R42)", async () => {
    const result = await commitStudentImport(
      [
        { rowNumber: 2, values: values("Fine", "space-v2-test-fine@jpc.test") },
        { rowNumber: 9, values: values("Bad", "nope") },
        { rowNumber: 10, values: { ...values("Long Phone", "space-v2-test-lp@jpc.test"), phone: "1".repeat(51) } },
      ],
      { kind: "season", seasonId: 7 },
    );

    expect(result.rows.map((r) => [r.rowNumber, r.outcome, r.message])).toEqual([
      [2, "created", null],
      [9, "failed", "Invalid name or email."],
      [10, "failed", "Invalid name or email."],
    ]);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it("a unique-violation race skips that row and continues (R52)", async () => {
    mockTx.user.createManyAndReturn.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const result = await commitStudentImport(
      [
        { rowNumber: 2, values: values("Racer", "space-v2-test-race@jpc.test") },
        { rowNumber: 3, values: values("After", "space-v2-test-after@jpc.test") },
      ],
      { kind: "season", seasonId: 7 },
    );

    expect(result.rows.map((r) => [r.outcome, r.message])).toEqual([
      ["skipped", "Already in the system."],
      ["created", null],
    ]);
  });

  it("an existing address — any role, deleted or not — is skipped, never written (R22, R44)", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([
      { id: 5, email: "Space-V2-Test-Gone@jpc.test", role: "STUDENT", deletedAt: new Date() },
    ]);

    const result = await commitStudentImport(
      [{ rowNumber: 2, values: values("Gone", "space-v2-test-gone@jpc.test") }],
      { kind: "season", seasonId: 7 },
    );

    expect(result.rows[0]).toMatchObject({ outcome: "skipped", message: "Already in the system.", userId: null });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("stores the address verbatim, with no credential", async () => {
    await commitStudentImport(
      [{ rowNumber: 2, values: values("One", "Space-V2-Test-Case@jpc.test") }],
      { kind: "alumni", graduationYear: 2020 },
    );

    const created = mockTx.user.createManyAndReturn.mock.calls[0][0].data;
    expect(created[0].email).toBe("Space-V2-Test-Case@jpc.test");
    expect(created[0].passwordHash).toBeNull();
    expect(created[0].role).toBe("STUDENT");
    // Alumni mode creates no enrolment at all (spec R48).
    expect(mockTx.seasonEnrollment.createMany).not.toHaveBeenCalled();
  });
});
