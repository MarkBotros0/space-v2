const mockTx = {
  user: { findMany: jest.fn(), updateMany: jest.fn() },
  studentProfile: { upsert: jest.fn() },
};
jest.mock("../db/client", () => ({
  db: { $transaction: (fn: (tx: typeof mockTx) => unknown) => fn(mockTx) },
}));

import { applyConversion, planConversion } from "../../scripts/convert-stored-roles";
import { databaseHostType } from "../../scripts/lib/db-host";

const person = (id: number, role: string, graduationYear: number | null, deletedAt: Date | null = null) => ({
  id,
  email: `p${id}@jpc.test`,
  role,
  graduationYear,
  deletedAt,
});

beforeEach(() => jest.clearAllMocks());

describe("planConversion", () => {
  it("turns ADMIN and LEADER into STUDENT and leaves everyone else out", () => {
    const plan = planConversion([
      person(1, "ADMIN", 2020),
      person(2, "LEADER", 2021),
      person(3, "SUPER", null),
      person(4, "MENTOR", null),
      person(5, "STUDENT", null),
    ]);
    expect(plan.convert.map((p) => [p.id, p.from, p.to])).toEqual([
      [1, "ADMIN", "STUDENT"],
      [2, "LEADER", "STUDENT"],
    ]);
    expect(plan.refused).toEqual([]);
  });

  it("lists anyone without a graduationYear under refused", () => {
    const plan = planConversion([person(1, "ADMIN", null), person(2, "LEADER", 2021), person(3, "LEADER", null)]);
    expect(plan.refused.map((p) => p.id)).toEqual([1, 3]);
    expect(plan.convert.map((p) => p.id)).toEqual([2]);
  });
});

describe("planConversion and deactivated accounts", () => {
  const gone = new Date(Date.UTC(2026, 0, 1));

  it("doesn't refuse a deactivated account with no year, and doesn't convert it", () => {
    const plan = planConversion([person(1, "ADMIN", null, gone), person(2, "LEADER", 2021)]);
    expect(plan.refused).toEqual([]);
    expect(plan.skipped.map((p) => p.id)).toEqual([1]);
    expect(plan.convert.map((p) => p.id)).toEqual([2]);
  });

  it("still converts a deactivated account that has a year", () => {
    const plan = planConversion([person(1, "ADMIN", 2020, gone)]);
    expect(plan.convert.map((p) => p.id)).toEqual([1]);
    expect(plan.skipped).toEqual([]);
  });
});

describe("applyConversion", () => {
  it("refuses and writes nothing when anyone is refused", async () => {
    mockTx.user.findMany.mockResolvedValue([person(1, "ADMIN", null), person(2, "LEADER", 2021)]);
    await expect(applyConversion()).rejects.toThrow(/graduation year/);
    expect(mockTx.user.updateMany).not.toHaveBeenCalled();
    expect(mockTx.studentProfile.upsert).not.toHaveBeenCalled();
  });

  it("sets the role and upserts each profile (a deleted account stays deleted on its User row)", async () => {
    const gone = new Date("2026-01-01T00:00:00.000Z");
    mockTx.user.findMany.mockResolvedValue([person(1, "ADMIN", 2020), person(2, "LEADER", 2021, gone)]);
    await expect(applyConversion()).resolves.toMatchObject({ converted: 2 });
    expect(mockTx.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: { role: "STUDENT" },
    });
    expect(mockTx.studentProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 1 },
      update: {},
      create: { userId: 1 },
    });
    expect(mockTx.studentProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 2 },
      update: {},
      create: { userId: 2 },
    });
  });

  it("is idempotent: a second run finds nobody and writes nothing", async () => {
    mockTx.user.findMany.mockResolvedValue([]);
    await expect(applyConversion()).resolves.toMatchObject({ converted: 0 });
    expect(mockTx.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("databaseHostType", () => {
  it.each([
    ["postgres://u:p@pooled.db.prisma.io:5432/db", "pooled"],
    ["postgres://u:p@ep-x-pooler.eu.aws.neon.tech/db", "pooled"],
    ["postgres://u:p@db.prisma.io:5432/db", "direct"],
    ["postgres://u:p@ep-x.eu.aws.neon.tech/db", "direct"],
  ])("%s is %s", (url, type) => {
    expect(databaseHostType(url)).toBe(type);
  });

  it("says unknown for a malformed URL rather than throwing an error that quotes it", () => {
    expect(databaseHostType("not a url secret")).toBe("unknown");
  });
});
