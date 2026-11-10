import {
  createQuizRequestSchema,
  quizQuestionStudentSchema,
  reorderQuestionsRequestSchema,
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

describe("reorderQuestionsRequestSchema", () => {
  it("requires a non-empty questionIds list to reorder", () => {
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [] }).success).toBe(false);
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [3, 1, 2] }).success).toBe(true);
  });
});
