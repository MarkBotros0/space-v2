import { budgetFrom, costMinutesFor, streakFrom } from "../lib/attendance-budget";

describe("budgetFrom (spec 04 R88–R90, spec 19 D14)", () => {
  it("charges the absence weight per ABSENT and the actual minutes per LATE", () => {
    expect(
      budgetFrom({ absentCount: 1, lateCount: 1, lateMinutesSum: 15, absenceWeightMinutes: 90, absenceBudgetMinutes: 180 }),
    ).toEqual({ minutesUsed: 105, budgetMinutes: 180, budgetPct: 58, remainingPct: 42, absentCount: 1, lateCount: 1 });
  });

  it("caps budgetPct at 100, so remainingPct bottoms out at 0 — minutesUsed is never capped", () => {
    expect(
      budgetFrom({ absentCount: 3, lateCount: 0, lateMinutesSum: 0, absenceWeightMinutes: 90, absenceBudgetMinutes: 180 }),
    ).toMatchObject({ minutesUsed: 270, budgetPct: 100, remainingPct: 0 });
  });

  it("is 0% used / 100% left for a clean record", () => {
    expect(
      budgetFrom({ absentCount: 0, lateCount: 0, lateMinutesSum: 0, absenceWeightMinutes: 90, absenceBudgetMinutes: 180 }),
    ).toMatchObject({ minutesUsed: 0, budgetPct: 0, remainingPct: 100 });
  });

  it("does not divide by zero when a season's budget is 0", () => {
    const base = { lateCount: 0, lateMinutesSum: 0, absenceWeightMinutes: 90, absenceBudgetMinutes: 0 };
    expect(budgetFrom({ ...base, absentCount: 0 })).toMatchObject({ budgetPct: 0, remainingPct: 100 });
    expect(budgetFrom({ ...base, absentCount: 1 })).toMatchObject({ budgetPct: 100, remainingPct: 0 });
  });
});

describe("costMinutesFor (R95)", () => {
  it("is the season's weight for ABSENT and the row's own minutes for LATE", () => {
    expect(costMinutesFor("ABSENT", null, 90)).toBe(90);
    expect(costMinutesFor("ABSENT", 40, 90)).toBe(90);
    expect(costMinutesFor("LATE", 12, 90)).toBe(12);
  });

  it("is null for PRESENT, for no record, and for a LATE without minutes (R89 — costs nothing)", () => {
    expect(costMinutesFor("PRESENT", null, 90)).toBeNull();
    expect(costMinutesFor(null, null, 90)).toBeNull();
    expect(costMinutesFor("LATE", null, 90)).toBeNull();
  });
});

describe("streakFrom (spec 09 R69, newest first)", () => {
  it("counts consecutive PRESENT/LATE back from the newest", () => {
    expect(streakFrom(["PRESENT", "LATE", "PRESENT"])).toBe(3);
  });

  it("skips an unmarked session instead of breaking on it", () => {
    expect(streakFrom([null, "PRESENT", null, "LATE", "ABSENT", "PRESENT"])).toBe(2);
  });

  it("stops at the first ABSENT", () => {
    expect(streakFrom(["ABSENT", "PRESENT", "PRESENT"])).toBe(0);
  });

  it("is 0 with no sessions or no records", () => {
    expect(streakFrom([])).toBe(0);
    expect(streakFrom([null, null])).toBe(0);
  });
});
