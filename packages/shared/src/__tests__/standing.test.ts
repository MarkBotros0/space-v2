import { seasonWriteRequestSchema } from "../season";
import { standingFor, type StandingHistoryRow } from "../standing";

const row = (over: Partial<StandingHistoryRow> & { seasonTitle: string; program: string }): StandingHistoryRow => ({
  finishedAt: new Date("2026-06-01T00:00:00Z"),
  enrollmentStatus: "COMPLETED",
  result: "PASSED",
  ...over,
});
const at = (month: number) => new Date(Date.UTC(2026, month, 1));

describe("standingFor", () => {
  it("is ok when no program is required", () => {
    const history = [row({ program: "GBV", seasonTitle: "GBV 2026", result: "NOT_PASSED" })];
    expect(standingFor({ requiredProgram: null, targetProgram: "LEAD" }, history)).toEqual({
      kind: "ok",
      reason: null,
      programSeasonTitle: null,
    });
  });

  it("blocks did_not_pass when the latest finished season in the required program was not passed", () => {
    const history = [row({ program: "GBV", seasonTitle: "GBV 2026", result: "NOT_PASSED" })];
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, history)).toEqual({
      kind: "blocked",
      reason: "did_not_pass",
      programSeasonTitle: "GBV 2026",
    });
  });

  it("blocks never_finished with no finished row, and a drop does not count", () => {
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, [])).toEqual({
      kind: "blocked",
      reason: "never_finished",
      programSeasonTitle: null,
    });
    const dropped = [row({ program: "GBV", seasonTitle: "GBV 2026", enrollmentStatus: "WITHDRAWN", result: null })];
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, dropped).reason).toBe("never_finished");
  });

  it("lets the latest result win: failed then passed is ok", () => {
    const history = [
      row({ program: "GBV", seasonTitle: "GBV 2026", result: "NOT_PASSED", finishedAt: at(5) }),
      row({ program: "GBV", seasonTitle: "GBV 2027", result: "PASSED", finishedAt: at(17) }),
    ];
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, history).kind).toBe("ok");
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, [...history].reverse()).kind).toBe("ok");
  });

  it("lets a retake through: did not pass GBV 2026 is ok for GBV 2027, blocked for LEAD 2027", () => {
    const history = [row({ program: "GBV", seasonTitle: "GBV 2026", result: "NOT_PASSED" })];
    expect(standingFor({ requiredProgram: null, targetProgram: "GBV" }, history).kind).toBe("ok");
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, history).kind).toBe("blocked");
  });

  it("treats a finished row with no result as ok (nothing recorded, nothing to block on)", () => {
    const history = [row({ program: "GBV", seasonTitle: "GBV 2026", result: null })];
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, history).kind).toBe("ok");
  });

  it("ignores rows that are not completed or have no finish date", () => {
    const history = [
      row({ program: "GBV", seasonTitle: "GBV 2026", enrollmentStatus: "ACTIVE", finishedAt: null, result: "PASSED" }),
    ];
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, history).reason).toBe("never_finished");
  });

  it("says already_passed when the latest finished row in the target program is passed", () => {
    const history = [
      row({ program: "GBV", seasonTitle: "GBV 2026", result: "PASSED", finishedAt: at(5) }),
      row({ program: "LEAD", seasonTitle: "LEAD 2026", result: "PASSED", finishedAt: at(6) }),
    ];
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, history)).toEqual({
      kind: "already_passed",
      reason: null,
      programSeasonTitle: "LEAD 2026",
    });
    expect(standingFor({ requiredProgram: null, targetProgram: "GBV" }, history).programSeasonTitle).toBe("GBV 2026");
  });

  it("is not already_passed once the latest target result is a fail, and blocked wins over already_passed", () => {
    const failedLater = [
      row({ program: "GBV", seasonTitle: "GBV 2026", result: "PASSED", finishedAt: at(5) }),
      row({ program: "GBV", seasonTitle: "GBV 2027", result: "NOT_PASSED", finishedAt: at(17) }),
    ];
    expect(standingFor({ requiredProgram: null, targetProgram: "GBV" }, failedLater).kind).toBe("ok");
    const blocked = [
      row({ program: "GBV", seasonTitle: "GBV 2026", result: "NOT_PASSED", finishedAt: at(5) }),
      row({ program: "LEAD", seasonTitle: "LEAD 2026", result: "PASSED", finishedAt: at(6) }),
    ];
    expect(standingFor({ requiredProgram: "GBV", targetProgram: "LEAD" }, blocked).kind).toBe("blocked");
  });
});

describe("a season can't require its own program", () => {
  const body = {
    program: "LEAD",
    year: 2027,
    startDate: "2027-01-01T00:00:00Z",
    endDate: "2027-06-01T00:00:00Z",
    status: "DRAFT",
  };
  it("refuses requiredProgram equal to program", () => {
    const res = seasonWriteRequestSchema.safeParse({ ...body, requiredProgram: "LEAD" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.message).toBe("A season can't require its own program.");
  });
  it("accepts another program, null, or none", () => {
    expect(seasonWriteRequestSchema.safeParse({ ...body, requiredProgram: "GBV" }).success).toBe(true);
    expect(seasonWriteRequestSchema.safeParse({ ...body, requiredProgram: null }).success).toBe(true);
    expect(seasonWriteRequestSchema.safeParse(body).success).toBe(true);
  });
});
