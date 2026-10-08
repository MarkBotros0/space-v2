// apps/backend/src/__tests__/import-commit.test.ts
//
// A unit test with the database module mocked. It exists for one assertion
// the integration suite structurally cannot make: that every write in
// commitStudentImport happens INSIDE the $transaction callback. Replace the
// $transaction with sequential db.* calls (Task 7 mutation 3) and the
// top-level spies below fire.

const mockTx = {
  user: { createManyAndReturn: jest.fn() },
  studentProfile: { createMany: jest.fn(), upsert: jest.fn() },
  seasonEnrollment: { createMany: jest.fn(), upsert: jest.fn() },
  $queryRaw: jest.fn(),
};
const mockDb = {
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  user: { createManyAndReturn: jest.fn(), create: jest.fn() },
  studentProfile: { createMany: jest.fn(), upsert: jest.fn() },
  seasonEnrollment: { createMany: jest.fn(), upsert: jest.fn() },
};

jest.mock("../db/client", () => ({ db: mockDb }));

import { commitStudentImport, ImportRowsInvalidError } from "../lib/imports/students";

const values = (name: string, email: string) => ({
  name, email,
  university: null, year: null, phone: null, dateOfBirth: null,
  spiritualBackground: null, gifts: null, notes: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));
  mockTx.$queryRaw.mockResolvedValue([]); // nobody exists yet
  mockTx.user.createManyAndReturn.mockImplementation(async ({ data }: { data: { email: string }[] }) =>
    data.map((d, i) => ({ id: 100 + i, email: d.email })),
  );
  mockTx.studentProfile.createMany.mockResolvedValue({ count: 0 });
  mockTx.seasonEnrollment.createMany.mockResolvedValue({ count: 0 });
});

describe("commitStudentImport", () => {
  it("issues every write on the transaction client and none on db itself", async () => {
    await commitStudentImport(
      [
        { rowNumber: 2, values: values("A Student", "space-v2-test-a@jpc.test") },
        { rowNumber: 3, values: values("B Student", "space-v2-test-b@jpc.test") },
      ],
      { kind: "season", seasonId: 7 },
      "skip",
    );

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.user.createManyAndReturn).toHaveBeenCalledTimes(1);
    // Three statements for the whole batch — not three PER ROW, which is what
    // makes an all-or-nothing 2000-row import affordable (D-16.5).
    expect(mockTx.studentProfile.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.seasonEnrollment.createMany).toHaveBeenCalledTimes(1);
    // The mutation detector:
    expect(mockDb.user.createManyAndReturn).not.toHaveBeenCalled();
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.studentProfile.createMany).not.toHaveBeenCalled();
    expect(mockDb.seasonEnrollment.createMany).not.toHaveBeenCalled();
  });

  it("throws before opening a transaction when any row is invalid", async () => {
    await expect(
      commitStudentImport(
        [
          { rowNumber: 2, values: values("Fine", "space-v2-test-fine@jpc.test") },
          { rowNumber: 9, values: values("Bad", "nope") },
        ],
        { kind: "season", seasonId: 7 },
        "skip",
      ),
    ).rejects.toBeInstanceOf(ImportRowsInvalidError);

    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("reports the offending row NUMBERS, never the addresses (spec D19)", async () => {
    const err = await commitStudentImport(
      [{ rowNumber: 41, values: values("Bad", "nope") }],
      { kind: "season", seasonId: 7 },
      "skip",
    ).catch((e: unknown) => e as ImportRowsInvalidError);

    expect(err).toBeInstanceOf(ImportRowsInvalidError);
    expect((err as ImportRowsInvalidError).rowNumbers).toEqual([41]);
  });

  it("writes one user per distinct address, case-insensitively", async () => {
    await commitStudentImport(
      [
        { rowNumber: 2, values: values("One", "space-v2-test-dup@jpc.test") },
        { rowNumber: 3, values: values("Two", "SPACE-V2-TEST-DUP@JPC.TEST") },
      ],
      { kind: "alumni", graduationYear: 2020 },
      "skip",
    );

    const created = mockTx.user.createManyAndReturn.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    // Stored verbatim, compared lower-cased (D-16.6).
    expect(created[0].email).toBe("space-v2-test-dup@jpc.test");
    // No credential, ever.
    expect(created[0].passwordHash).toBeNull();
    expect(created[0].role).toBe("STUDENT");
    // Alumni mode creates no enrolment at all (spec R48).
    expect(mockTx.seasonEnrollment.createMany).not.toHaveBeenCalled();
  });
});
