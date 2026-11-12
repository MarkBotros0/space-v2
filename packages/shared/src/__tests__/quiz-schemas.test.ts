import {
  createQuizRequestSchema,
  quizAnswerInputSchema,
  quizQuestionStudentSchema,
  reorderQuestionsRequestSchema,
  manualScoreWriteSchema,
  saveQuizGradesRequestSchema,
} from "../index";

describe("the answer-key split (spec D2)", () => {
  const base = { id: 1, order: 0, prompt: "Pick", points: 2, pointsAwarded: null };

  it("sends the key only inside `review`, never as a top-level field", () => {
    for (const shape of Object.values(quizQuestionStudentSchema.options).map((o) => Object.keys(o.shape))) {
      expect(shape).not.toContain("correctOptionIds");
      expect(shape).not.toContain("isCorrect");
      expect(shape).not.toContain("expected");
    }
  });

  it("refuses a key a careless handler passed in at the top level", () => {
    const leaky = {
      ...base,
      type: "SINGLE_CHOICE",
      options: [{ id: 1, label: "a" }],
      answer: { optionId: null },
      review: null,
      correctOptionIds: [1],
    };
    expect(quizQuestionStudentSchema.safeParse(leaky).success).toBe(false);
  });
});

describe("no key inside a student question's items (final review I2)", () => {
  const base = { id: 1, order: 0, prompt: "P", points: 2, pointsAwarded: null, review: null };
  const ok = (v: unknown) => quizQuestionStudentSchema.safeParse(v).success;
  const single = { ...base, type: "SINGLE_CHOICE", options: [{ id: 1, label: "a" }], answer: { optionId: null } };
  const multi = {
    ...base,
    type: "MULTI_CHOICE",
    choose: 2,
    options: [{ id: 1, label: "a" }],
    answer: { optionIds: [] },
  };
  const matching = {
    ...base,
    type: "MATCHING",
    left: [{ id: 1, label: "L" }],
    right: [{ id: 2, label: "R" }],
    answer: { pairs: [] },
  };
  const blank = { ...base, type: "FILL_BLANK", blanks: [{ id: 5, position: 0 }], answer: { blanks: [] } };

  it("accepts the keyless shapes", () => {
    for (const q of [single, multi, matching, blank]) expect(ok(q)).toBe(true);
  });

  it("options are exactly { id, label }", () => {
    expect(ok({ ...single, options: [{ id: 1, label: "a", isCorrect: true }] })).toBe(false);
    expect(ok({ ...multi, options: [{ id: 1, label: "a", isCorrect: false }] })).toBe(false);
    expect(ok({ ...single, options: [{ id: 1, label: "a", position: 0 }] })).toBe(false);
  });

  it("matching items carry no matchId, isCorrect or expected", () => {
    expect(ok({ ...matching, left: [{ id: 1, label: "L", matchId: 2 }] })).toBe(false);
    expect(ok({ ...matching, right: [{ id: 2, label: "R", isCorrect: true }] })).toBe(false);
    expect(ok({ ...matching, left: [{ id: 1, label: "L", expected: "R" }] })).toBe(false);
  });

  it("blanks are exactly { id, position }", () => {
    expect(ok({ ...blank, blanks: [{ id: 5, position: 0, expected: "x" }] })).toBe(false);
    expect(ok({ ...blank, blanks: [{ id: 5, position: 0, isCorrect: true }] })).toBe(false);
  });

  it("a strict parse fails on any extra key, at the top or in the answer", () => {
    expect(ok({ ...single, extra: 1 })).toBe(false);
    expect(ok({ ...single, answer: { optionId: null, isCorrect: true } })).toBe(false);
    expect(ok({ ...matching, answer: { pairs: [{ leftId: 1, rightId: 2, correct: true }] } })).toBe(false);
  });
});

describe("quizAnswerInputSchema", () => {
  it("refuses the same blank twice in one FILL_BLANK answer", () => {
    const answer = (blanks: { blankId: number; text: string }[]) =>
      quizAnswerInputSchema.safeParse({ type: "FILL_BLANK", questionId: 3, blanks }).success;
    expect(
      answer([
        { blankId: 5, text: "a" },
        { blankId: 6, text: "b" },
      ]),
    ).toBe(true);
    expect(
      answer([
        { blankId: 5, text: "a" },
        { blankId: 5, text: "b" },
      ]),
    ).toBe(false);
  });
});

describe("createQuizRequestSchema", () => {
  const base = { seasonId: 7, sessionId: 12, title: "Week 1 quiz" };

  it("requires maxScore for PAPER (R3)", () => {
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "PAPER" }).success).toBe(false);
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "PAPER", maxScore: 20 }).success).toBe(true);
  });

  it("REJECTS maxScore for ONLINE instead of silently zeroing it (R4, §7)", () => {
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "ONLINE", maxScore: 20 }).success).toBe(false);
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "ONLINE" }).success).toBe(true);
  });

  it("accepts a session-less quiz (D12) — the column is nullable", () => {
    expect(createQuizRequestSchema.safeParse({ ...base, sessionId: null, kind: "ONLINE" }).success).toBe(true);
  });
});

describe("saveQuizGradesRequestSchema", () => {
  it("allows a null score as an explicit clear (diverging from R89)", () => {
    expect(
      saveQuizGradesRequestSchema.safeParse({
        entries: [{ studentUserId: 9, score: null, notes: null }],
      }).success,
    ).toBe(true);
  });

  it("refuses a negative score", () => {
    expect(
      saveQuizGradesRequestSchema.safeParse({
        entries: [{ studentUserId: 9, score: -1, notes: null }],
      }).success,
    ).toBe(false);
  });
});

describe("manualScoreWriteSchema", () => {
  it("rounds a score to two decimals, so float noise stores and compares as the typed value", () => {
    expect(manualScoreWriteSchema.parse({ score: 0.1 + 0.2, notes: null }).score).toBe(0.3);
    expect(manualScoreWriteSchema.parse({ score: 7.55 }).score).toBe(7.55);
    expect(manualScoreWriteSchema.safeParse({ score: 7.555, notes: null }).success).toBe(false);
    expect(
      saveQuizGradesRequestSchema.parse({ entries: [{ studentUserId: 9, score: 0.1 + 0.2, notes: null }] }).entries[0]
        ?.score,
    ).toBe(0.3);
  });
});

describe("reorderQuestionsRequestSchema", () => {
  it("requires a non-empty questionIds list to reorder", () => {
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [] }).success).toBe(false);
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [3, 1, 2] }).success).toBe(true);
  });
});
