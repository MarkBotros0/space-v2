import {
  DEFAULT_PASS_CRITERIA,
  meetsMark,
  passCriteriaSchema,
  passingNumbersSchema,
  passingPcts,
  passWeightsSchema,
  pointsShort,
  seasonAvailabilitySchema,
  weakestNumber,
  weightedScore,
  type PassingNumberKey,
  type PassingPcts,
  type PassWeights,
} from "../index";

const w404030: PassWeights = { attendance: 40, assignments: 30, quizzes: 30 };

describe("season passing score", () => {
  it("the rounded score decides at the mark", () => {
    // 1199 of 2000 marks is 59.95%: it shows 60.0 and passes a mark of 60.
    const high = passingPcts({
      attendance: { attended: 0, total: 0 },
      assignments: { submitted: 0, total: 0 },
      quizzes: { scored: 1199, max: 2000 },
    });
    const atMark = weightedScore(high, { attendance: 0, assignments: 0, quizzes: 100 });
    expect(atMark).toEqual({ score: 60, rescaled: false });
    expect(meetsMark(atMark.score, 60)).toBe(true);

    // 59.94% shows 59.9 and does not.
    const low = weightedScore(
      { attendance: 59.94, assignments: 59.94, quizzes: 59.94 },
      { attendance: 40, assignments: 30, quizzes: 30 },
    );
    expect(low.score).toBe(59.9);
    expect(meetsMark(low.score, 60)).toBe(false);
    expect(pointsShort(59.9, 60)).toBe(0.1);
    expect(pointsShort(60, 60)).toBe(0);
  });

  it("a student with no sessions of their own is re-scaled", () => {
    const pcts = passingPcts({
      attendance: { attended: 0, total: 0 },
      assignments: { submitted: 8, total: 10 },
      quizzes: { scored: 30, max: 50 },
    });
    expect(pcts).toEqual({ attendance: null, assignments: 80, quizzes: 60 });
    expect(weightedScore(pcts, w404030)).toEqual({ score: 70, rescaled: true });
  });

  it("a null number with no weight is not a re-scale", () => {
    const pcts = { attendance: null, assignments: 80, quizzes: 60 };
    expect(weightedScore(pcts, { attendance: 0, assignments: 50, quizzes: 50 })).toEqual({
      score: 70,
      rescaled: false,
    });
  });

  it("no weighted number gives no score", () => {
    const none = { attendance: null, assignments: null, quizzes: null };
    expect(weightedScore(none, w404030)).toEqual({ score: null, rescaled: true });
    expect(meetsMark(null, 60)).toBeNull();
    // Only an unweighted number is present.
    expect(weightedScore({ attendance: null, assignments: null, quizzes: 90 }, { ...w404030, quizzes: 0 }).score).toBe(
      null,
    );
  });

  it("weights must add up to 100", () => {
    const refused = passCriteriaSchema.safeParse({
      weights: { attendance: 39, assignments: 30, quizzes: 30 },
      passMark: 60,
    });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.map((i) => i.message)).toContain("The weights must add up to 100%.");
    expect(passCriteriaSchema.safeParse(DEFAULT_PASS_CRITERIA).success).toBe(true);
    expect(passCriteriaSchema.safeParse({ ...DEFAULT_PASS_CRITERIA, passMark: 101 }).success).toBe(false);
    expect(
      passCriteriaSchema.safeParse({ weights: { attendance: 40.5, assignments: 29.5, quizzes: 30 }, passMark: 60 })
        .success,
    ).toBe(false);
  });

  it("weakestNumber ignores a zero weight", () => {
    const pcts = { attendance: 20, assignments: 50, quizzes: 45 };
    expect(weakestNumber(pcts, w404030)).toBe("attendance");
    expect(weakestNumber(pcts, { attendance: 0, assignments: 50, quizzes: 50 })).toBe("quizzes");
    expect(weakestNumber({ attendance: null, assignments: null, quizzes: 10 }, { ...w404030, quizzes: 0 })).toBeNull();
  });

  it("the contracts hold whole counts and booleans", () => {
    const numbers = {
      attendance: { attended: 2, total: 3 },
      assignments: { submitted: 1, total: 2 },
      quizzes: { scored: 19.5, max: 35 },
    };
    expect(passingNumbersSchema.parse(numbers)).toEqual(numbers);
    expect(passingNumbersSchema.safeParse({ ...numbers, assignments: { submitted: 1.5, total: 2 } }).success).toBe(
      false,
    );
    expect(seasonAvailabilitySchema.parse({ attendance: true, assignments: false, quizzes: true })).toBeTruthy();
    expect(passWeightsSchema.safeParse({ ...w404030, extra: 1 }).success).toBe(false);
    const pcts: PassingPcts = passingPcts(numbers);
    const order: PassingNumberKey[] = ["attendance", "assignments", "quizzes"];
    expect(order.map((k) => pcts[k])).toEqual([(2 / 3) * 100, 50, (19.5 / 35) * 100]);
  });

  it("defaults are 40 / 30 / 30 and 60", () => {
    expect(DEFAULT_PASS_CRITERIA).toEqual({ weights: w404030, passMark: 60 });
  });
});
