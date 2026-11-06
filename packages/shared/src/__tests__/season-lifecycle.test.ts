import { endSeasonRequestSchema, seasonOutcomeLabel } from "../season-lifecycle";

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
});
