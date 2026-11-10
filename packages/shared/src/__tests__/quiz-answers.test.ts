import { markAttemptRequestSchema, quizAnswerInputSchema, saveQuizAnswersRequestSchema } from "../index";

describe("quizAnswerInputSchema", () => {
  it("MULTI_CHOICE duplicate optionIds refused", () => {
    const answer = { type: "MULTI_CHOICE", questionId: 1 };
    expect(quizAnswerInputSchema.safeParse({ ...answer, optionIds: [4, 4] }).success).toBe(false);
    expect(quizAnswerInputSchema.safeParse({ ...answer, optionIds: [4, 5] }).success).toBe(true);
  });

  it("MATCHING duplicate rightId refused", () => {
    const dup = {
      type: "MATCHING",
      questionId: 1,
      pairs: [
        { leftId: 1, rightId: 9 },
        { leftId: 2, rightId: 9 },
      ],
    };
    expect(quizAnswerInputSchema.safeParse(dup).success).toBe(false);
  });

  it("answer union rejects a field from another type", () => {
    const essay = { type: "ESSAY", questionId: 1, text: "x" };
    expect(quizAnswerInputSchema.safeParse({ ...essay, optionId: 1 }).success).toBe(false);
    expect(quizAnswerInputSchema.safeParse(essay).success).toBe(true);
  });

  it("accepts a null single choice, and an empty batch is refused", () => {
    const single = { type: "SINGLE_CHOICE", questionId: 1, optionId: null };
    expect(quizAnswerInputSchema.safeParse(single).success).toBe(true);
    expect(saveQuizAnswersRequestSchema.safeParse({ answers: [] }).success).toBe(false);
  });
});

describe("markAttemptRequestSchema", () => {
  it("empty marks refused", () => {
    expect(markAttemptRequestSchema.safeParse({ marks: [] }).success).toBe(false);
    const mark = { questionId: 1, blankId: null, correct: true };
    expect(markAttemptRequestSchema.safeParse({ marks: [mark] }).success).toBe(true);
  });
});
