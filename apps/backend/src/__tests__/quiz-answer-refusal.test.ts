/**
 * answerRefusal: the membership checks a save makes before writing anything.
 * The shared schema checks shapes; this checks that every id belongs to THIS
 * question, on the right side, and that "Choose N" is not exceeded.
 */
jest.mock("../db/client", () => ({ db: {} }));

import type { QuizQuestionType } from "../generated/prisma/enums";
import { answerRefusal } from "../lib/quizzes/attempts";
import type { MarkableQuestion } from "../lib/quizzes/marking";

type Opt = MarkableQuestion["options"][number];
const opt = (id: number, isCorrect = false, side: Opt["side"] = null, matchId: number | null = null): Opt => ({
  id,
  isCorrect,
  side,
  matchId,
});
const question = (id: number, type: QuizQuestionType, options: Opt[] = [], blankIds: number[] = []) => ({
  id,
  type,
  points: 3,
  options,
  blanks: blankIds.map((b) => ({ id: b })),
});

const single = question(1, "SINGLE_CHOICE", [opt(11, true), opt(12)]);
const multi = question(2, "MULTI_CHOICE", [opt(21, true), opt(22, true), opt(23), opt(24)]);
const matching = question(3, "MATCHING", [
  opt(31, false, "LEFT", 33),
  opt(32, false, "LEFT", 34),
  opt(33, false, "RIGHT"),
  opt(34, false, "RIGHT"),
]);
const fill = question(4, "FILL_BLANK", [], [41, 42]);
const essay = question(5, "ESSAY");
const byId = new Map<number, MarkableQuestion>([single, multi, matching, fill, essay].map((q) => [q.id, q]));

describe("answerRefusal", () => {
  it("accepts a valid answer of every type", () => {
    expect(
      answerRefusal(byId, [
        { type: "SINGLE_CHOICE", questionId: 1, optionId: 12 },
        { type: "MULTI_CHOICE", questionId: 2, optionIds: [21, 23] },
        { type: "MATCHING", questionId: 3, pairs: [{ leftId: 31, rightId: 34 }] },
        { type: "FILL_BLANK", questionId: 4, blanks: [{ blankId: 41, text: "x" }] },
        { type: "ESSAY", questionId: 5, text: "Because." },
      ]),
    ).toBeNull();
  });

  it("accepts a cleared single choice", () => {
    expect(answerRefusal(byId, [{ type: "SINGLE_CHOICE", questionId: 1, optionId: null }])).toBeNull();
  });

  it("refuses a question that is not in the quiz", () => {
    expect(answerRefusal(byId, [{ type: "ESSAY", questionId: 99, text: "x" }])?.code).toBe("question_not_in_quiz");
  });

  it("refuses more ticks than Choose N", () => {
    const refusal = answerRefusal(byId, [{ type: "MULTI_CHOICE", questionId: 2, optionIds: [21, 22, 23] }]);
    expect(refusal).toEqual({ code: "too_many_choices", message: "Choose at most 2." });
  });

  it("refuses an option id from another question", () => {
    expect(answerRefusal(byId, [{ type: "SINGLE_CHOICE", questionId: 1, optionId: 21 }])?.code).toBe(
      "answer_out_of_range",
    );
    expect(answerRefusal(byId, [{ type: "MULTI_CHOICE", questionId: 2, optionIds: [11] }])?.code).toBe(
      "answer_out_of_range",
    );
  });

  it("refuses a RIGHT item used as a left one, and a LEFT item used as a right one", () => {
    expect(answerRefusal(byId, [{ type: "MATCHING", questionId: 3, pairs: [{ leftId: 33, rightId: 34 }] }])?.code).toBe(
      "answer_out_of_range",
    );
    expect(answerRefusal(byId, [{ type: "MATCHING", questionId: 3, pairs: [{ leftId: 31, rightId: 32 }] }])?.code).toBe(
      "answer_out_of_range",
    );
  });

  it("refuses a blank of another question and the same blank twice", () => {
    expect(
      answerRefusal(byId, [{ type: "FILL_BLANK", questionId: 4, blanks: [{ blankId: 99, text: "x" }] }])?.code,
    ).toBe("answer_out_of_range");
    const twice = [
      { blankId: 41, text: "a" },
      { blankId: 41, text: "b" },
    ];
    expect(answerRefusal(byId, [{ type: "FILL_BLANK", questionId: 4, blanks: twice }])?.code).toBe(
      "answer_out_of_range",
    );
  });

  it("refuses an answer whose type is not the question's", () => {
    expect(answerRefusal(byId, [{ type: "ESSAY", questionId: 1, text: "x" }])?.code).toBe("wrong_answer_type");
    expect(answerRefusal(byId, [{ type: "TRUE_FALSE", questionId: 1, optionId: 11 }])?.code).toBe("wrong_answer_type");
  });

  it("reports the first refusal in order", () => {
    const refusal = answerRefusal(byId, [
      { type: "ESSAY", questionId: 5, text: "ok" },
      { type: "ESSAY", questionId: 1, text: "x" },
      { type: "ESSAY", questionId: 99, text: "x" },
    ]);
    expect(refusal?.code).toBe("wrong_answer_type");
  });
});
