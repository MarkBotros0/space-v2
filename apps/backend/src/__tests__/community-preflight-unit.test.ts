// The preflight must work on a database not migrated yet: an old database has no `result`
// column until `migrate deploy` reaches it, and the point of the read-only run is
// to see the violations before that.
const mockCount = jest.fn();
const mockFindMany = jest.fn();
jest.mock("../db/client", () => ({
  db: {
    user: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    groupLeader: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    seasonAdmin: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    seasonEnrollment: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
  },
}));

import {
  applyRefusal,
  findRoleRuleViolations,
  readOnlyReport,
} from "../../scripts/community-preflight";

const missingColumn = Object.assign(new Error("The column `result` does not exist in the current database."), {
  code: "P2022",
});

beforeEach(() => {
  mockCount.mockReset();
  mockFindMany.mockReset();
  mockFindMany.mockResolvedValue([]);
});

describe("readOnlyReport", () => {
  it("prints the violations first and says what is unknown when `result` is missing", async () => {
    mockCount.mockRejectedValue(missingColumn);
    const lines: string[] = [];
    await readOnlyReport((...a) => lines.push(a.map(String).join(" ")));
    expect(lines[0]).toMatch(/Role-rule violations/);
    const text = lines.join("\n");
    expect(text).toMatch(/result.*column.*(missing|not)/i);
    expect(text).toMatch(/unknown/i);
    expect(text).not.toMatch(/Would change/);
  });

  it("does not hide any other database error", async () => {
    mockCount.mockRejectedValue(new Error("connection reset"));
    await expect(readOnlyReport(() => undefined)).rejects.toThrow("connection reset");
  });

  it("reports the counts on a migrated database", async () => {
    mockCount.mockResolvedValue(0);
    const lines: string[] = [];
    await readOnlyReport((...a) => lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
    expect(lines.join("\n")).toMatch(/Would change.*markedPassed/);
    expect(lines.join("\n")).toMatch(/--apply would be: allowed/);
  });
});

describe("readOnlyReport review lists", () => {
  it("prints the review sections after the violations, and they never block --apply", async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockImplementation(async (args: { where?: { role?: unknown } }) =>
      args?.where?.role && typeof args.where.role === "object" ? [{ id: 5, role: "ADMIN" }] : [],
    );
    const lines: string[] = [];
    await readOnlyReport((...a) => lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
    const text = lines.join("\n");
    expect(text).toMatch(/Review.*not violations/i);
    expect(text).toMatch(/storedStaffWithoutGraduationYear/);
    expect(text).toMatch(/staffNotAlumni/);
    expect(text).toMatch(/draftSeatHolders/);
    expect(text).toMatch(/storedStudentsHoldingSeats/);
    expect(text).toMatch(/alumniHoldingActiveEnrollment/);
    expect(text).toMatch(/--apply would be: allowed/);
  });

  it("says what is unknown when a column is missing, and goes on to the backfill report", async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockImplementation(async (args: { where?: { role?: unknown } }) => {
      if (args?.where?.role && typeof args.where.role === "object") throw missingColumn;
      return [];
    });
    const lines: string[] = [];
    await readOnlyReport((...a) => lines.push(a.map(String).join(" ")));
    expect(lines.join("\n")).toMatch(/review lists.*unknown/i);
    expect(lines.join("\n")).toMatch(/--apply would be/);
  });
});

describe("applyRefusal", () => {
  it("states the count without claiming the backfill ran", async () => {
    mockCount.mockResolvedValue(7);
    const refusal = await applyRefusal(await findRoleRuleViolations());
    expect(refusal).toMatch(/7 enrolment/);
    expect(refusal).not.toMatch(/already run|has run|already ran/i);
  });

  it("refuses, with the reason, on a database without the column", async () => {
    mockCount.mockRejectedValue(missingColumn);
    expect(await applyRefusal(await findRoleRuleViolations())).toMatch(/migrat/i);
  });
});
