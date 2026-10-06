import {
  createQuizRequestSchema,
  gradeEssayAnswersRequestSchema,
  quizQuestionRequestSchema,
  quizQuestionStudentSchema,
  reorderQuestionsRequestSchema,
  saveQuizAnswersRequestSchema,
  saveQuizGradesRequestSchema,
} from "../index";

describe("the answer-key split (spec D2)", () => {
  it("has no correctIndex key on the student question schema, even as optional", () => {
    // The protection in v1 was a `select` list in a 559-line file that also
    // held the two reads that DO return the key. Here it is the type: if this
    // shape ever gains the field, this fails before any handler can leak it.
    expect(Object.keys(quizQuestionStudentSchema.shape)).not.toContain("correctIndex");
  });

  it("strips a correctIndex a careless handler passed in", () => {
    const parsed = quizQuestionStudentSchema.parse({
      id: 1, order: 0, type: "MCQ", prompt: "Capital of France?", points: 2,
      options: ["London", "Paris"], selectedIndex: 1, text: null,
      isCorrect: null, pointsAwarded: null,
      correctIndex: 1,
    } as never);
    expect(JSON.stringify(parsed)).not.toContain("correctIndex");
  });
});

describe("createQuizRequestSchema", () => {
  const base = { seasonId: 7, sessionId: 12, title: "Week 1 quiz" };

  it("requires maxScore for PAPER (R3)", () => {
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "PAPER" }).success).toBe(false);
    expect(
      createQuizRequestSchema.safeParse({ ...base, kind: "PAPER", maxScore: 20 }).success,
    ).toBe(true);
  });

  it("REJECTS maxScore for ONLINE instead of silently zeroing it (R4, §7)", () => {
    expect(
      createQuizRequestSchema.safeParse({ ...base, kind: "ONLINE", maxScore: 20 }).success,
    ).toBe(false);
    expect(createQuizRequestSchema.safeParse({ ...base, kind: "ONLINE" }).success).toBe(true);
  });

  it("accepts a session-less quiz (D12) — the column is nullable", () => {
    expect(
      createQuizRequestSchema.safeParse({ ...base, sessionId: null, kind: "ONLINE" }).success,
    ).toBe(true);
  });
});

describe("quizQuestionRequestSchema", () => {
  it("needs at least 2 options and an in-range correctIndex for MCQ (R17, R18)", () => {
    const mcq = { type: "MCQ", prompt: "Pick one", points: 2, options: ["a"], correctIndex: 0 };
    expect(quizQuestionRequestSchema.safeParse(mcq).success).toBe(false);
    expect(
      quizQuestionRequestSchema.safeParse({ ...mcq, options: ["a", "b"], correctIndex: 2 }).success,
    ).toBe(false);
    expect(
      quizQuestionRequestSchema.safeParse({ ...mcq, options: ["a", "b"], correctIndex: 1 }).success,
    ).toBe(true);
  });

  it("normalises ESSAY to no options and no correct answer in the transform (R19)", () => {
    const parsed = quizQuestionRequestSchema.parse({
      type: "ESSAY", prompt: "  Discuss.  ", points: 5,
      options: ["stray", "values"], correctIndex: 1,
    });
    expect(parsed).toMatchObject({ prompt: "Discuss.", options: [], correctIndex: null });
  });

  it("caps options at 6 and prompt at 2000 (R16)", () => {
    expect(
      quizQuestionRequestSchema.safeParse({
        type: "MCQ", prompt: "Pick", points: 1,
        options: ["a", "b", "c", "d", "e", "f", "g"], correctIndex: 0,
      }).success,
    ).toBe(false);
  });
});

describe("saveQuizAnswersRequestSchema", () => {
  it("has no hard-coded index ceiling — the option count is a server check (R51)", () => {
    // v1 capped selectedIndex at 5 in the schema, which is neither the real
    // bound nor a check against this question's options.
    expect(
      saveQuizAnswersRequestSchema.safeParse({
        answers: [{ questionId: 3, selectedIndex: 5, text: null }],
      }).success,
    ).toBe(true);
  });

  it("refuses an empty batch", () => {
    expect(saveQuizAnswersRequestSchema.safeParse({ answers: [] }).success).toBe(false);
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

describe("gradeEssayAnswersRequestSchema / reorderQuestionsRequestSchema", () => {
  it("requires at least one award and a non-negative integer", () => {
    expect(gradeEssayAnswersRequestSchema.safeParse({ awards: [] }).success).toBe(false);
    expect(
      gradeEssayAnswersRequestSchema.safeParse({ awards: [{ questionId: 1, points: -1 }] }).success,
    ).toBe(false);
  });

  it("requires a non-empty questionIds list to reorder", () => {
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [] }).success).toBe(false);
    expect(reorderQuestionsRequestSchema.safeParse({ questionIds: [3, 1, 2] }).success).toBe(true);
  });
});
