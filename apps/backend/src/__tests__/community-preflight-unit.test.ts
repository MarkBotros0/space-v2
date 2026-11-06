// The preflight must work on a database not migrated yet: Neon has no `result`
// column until `migrate deploy` reaches it, and the point of the read-only run is
// to see the violations before that.
const mockCount = jest.fn();
const mockFindMany = jest.fn();
jest.mock("../db/client", () => ({
  db: {
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
