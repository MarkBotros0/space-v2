import {
  classLabel,
  endSeasonRequestSchema,
  seasonOutcomeLabel,
  updateSeasonResultRequestSchema,
} from "../season-lifecycle";

describe("season lifecycle contracts", () => {
  it("labels every outcome in words", () => {
    expect(seasonOutcomeLabel("PASSED")).toBe("Passed");
    expect(seasonOutcomeLabel("NOT_PASSED")).toBe("Did not pass");
    expect(seasonOutcomeLabel("COMPLETED")).toBe("Completed");
    expect(seasonOutcomeLabel("DROPPED")).toBe("Did not finish");
  });

  const reviewed = { graduatesOnPass: false, userIds: [3], scores: [{ userId: 3, score: 72.5 }] };
  const criteria = { weights: { attendance: 40, assignments: 30, quizzes: 30 }, passMark: 60 };

  it("rejects an unknown key on the end-season request", () => {
    expect(endSeasonRequestSchema.safeParse({ notPassed: [], ...criteria, reviewed, extra: 1 }).success).toBe(false);
    const ok = endSeasonRequestSchema.safeParse({ notPassed: [{ userId: 3, reason: null }], ...criteria, reviewed });
    expect(ok.success).toBe(true);
    expect(ok.data?.passedNotes).toEqual([]);
  });

  it("requires the criteria, weights adding up to 100, and the scores shown", () => {
    expect(endSeasonRequestSchema.safeParse({ notPassed: [], reviewed }).success).toBe(false);
    const off = { notPassed: [], weights: { attendance: 40, assignments: 30, quizzes: 20 }, passMark: 60, reviewed };
    const res = endSeasonRequestSchema.safeParse(off);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("The weights must add up to 100%.");
    const noScores = { notPassed: [], ...criteria, reviewed: { graduatesOnPass: false, userIds: [3] } };
    expect(endSeasonRequestSchema.safeParse(noScores).success).toBe(false);
  });

  it("requires what the staff member reviewed", () => {
    expect(endSeasonRequestSchema.safeParse({ notPassed: [] }).success).toBe(false);
    expect(endSeasonRequestSchema.safeParse({ notPassed: [], reviewed: { userIds: [] } }).success).toBe(false);
  });

  it("limits a reason to 1000 characters on both requests", () => {
    const row = (reason: string) => ({ notPassed: [{ userId: 3, reason }], ...criteria, reviewed });
    expect(endSeasonRequestSchema.safeParse(row("x".repeat(1000))).success).toBe(true);
    expect(endSeasonRequestSchema.safeParse(row("x".repeat(1001))).success).toBe(false);
    const result = (reason: string) => ({ result: "NOT_PASSED", reason });
    expect(updateSeasonResultRequestSchema.safeParse(result("x".repeat(1000))).success).toBe(true);
    expect(updateSeasonResultRequestSchema.safeParse(result("x".repeat(1001))).success).toBe(false);
  });

  it("rejects a student listed twice", () => {
    const twice = {
      notPassed: [
        { userId: 3, reason: "a" },
        { userId: 3, reason: null },
      ],
      ...criteria,
      reviewed,
    };
    expect(endSeasonRequestSchema.safeParse(twice).success).toBe(false);
  });
});

describe("classLabel", () => {
  it("writes a class as JPCS and the year's last two digits (owner 2026-11-10)", () => {
    expect(classLabel(2025)).toBe("JPCS-25");
    expect(classLabel(2026)).toBe("JPCS-26");
    expect(classLabel(2005)).toBe("JPCS-05");
  });
});
