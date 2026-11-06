import { endSeasonRequestSchema, seasonOutcomeLabel, updateSeasonResultRequestSchema } from "../season-lifecycle";

describe("season lifecycle contracts", () => {
  it("labels every outcome in words", () => {
    expect(seasonOutcomeLabel("PASSED")).toBe("Passed");
    expect(seasonOutcomeLabel("NOT_PASSED")).toBe("Did not pass");
    expect(seasonOutcomeLabel("COMPLETED")).toBe("Completed");
    expect(seasonOutcomeLabel("DROPPED")).toBe("Did not finish");
  });

  it("rejects an unknown key on the end-season request", () => {
    expect(endSeasonRequestSchema.safeParse({ notPassed: [], extra: 1 }).success).toBe(false);
    expect(
      endSeasonRequestSchema.safeParse({ notPassed: [{ userId: 3, reason: null }] }).success,
    ).toBe(true);
  });

  it("limits a reason to 1000 characters on both requests", () => {
    const row = (reason: string) => ({ notPassed: [{ userId: 3, reason }] });
    expect(endSeasonRequestSchema.safeParse(row("x".repeat(1000))).success).toBe(true);
    expect(endSeasonRequestSchema.safeParse(row("x".repeat(1001))).success).toBe(false);
    const result = (reason: string) => ({ result: "NOT_PASSED", reason });
    expect(updateSeasonResultRequestSchema.safeParse(result("x".repeat(1000))).success).toBe(true);
    expect(updateSeasonResultRequestSchema.safeParse(result("x".repeat(1001))).success).toBe(false);
  });

  it("rejects a student listed twice", () => {
    const twice = { notPassed: [{ userId: 3, reason: "a" }, { userId: 3, reason: null }] };
    expect(endSeasonRequestSchema.safeParse(twice).success).toBe(false);
  });
});
