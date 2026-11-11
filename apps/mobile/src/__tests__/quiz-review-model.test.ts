import type { QuizQuestionStudent } from "@space/shared";

import { blankRows, matchRows, reviewRows, verdictOf } from "../screens/quiz-detail/review/review-model";

type Q<T extends QuizQuestionStudent["type"]> = Extract<QuizQuestionStudent, { type: T }>;

const base = { id: 1, order: 0, prompt: "P", points: 2, pointsAwarded: 0 };
const opts = [
  { id: 11, label: "London" },
  { id: 12, label: "Paris" },
  { id: 13, label: "Rome" },
];

describe("reviewRows", () => {
  it("marks a wrong tick and shows the key", () => {
    const q: Q<"SINGLE_CHOICE" | "TRUE_FALSE"> = {
      ...base,
      type: "SINGLE_CHOICE",
      options: opts,
      answer: { optionId: 11 },
      review: { correctOptionIds: [12] },
    };
    expect(reviewRows(q)).toEqual([
      { label: "London", mine: true, correct: false, isAnswerKey: false },
      { label: "Paris", mine: false, correct: false, isAnswerKey: true },
      { label: "Rome", mine: false, correct: true, isAnswerKey: false },
    ]);
  });

  it("marks each option of a multiple choice question on its own", () => {
    const q: Q<"MULTI_CHOICE"> = {
      ...base,
      type: "MULTI_CHOICE",
      options: opts,
      choose: 2,
      answer: { optionIds: [11, 12] },
      review: { correctOptionIds: [12, 13] },
    };
    expect(reviewRows(q).map((r) => [r.mine, r.correct, r.isAnswerKey])).toEqual([
      [true, false, false],
      [true, true, true],
      [false, false, true],
    ]);
  });
});

describe("matchRows", () => {
  const q: Q<"MATCHING"> = {
    ...base,
    type: "MATCHING",
    left: [
      { id: 1, label: "France" },
      { id: 2, label: "Italy" },
    ],
    right: [
      { id: 21, label: "Paris" },
      { id: 22, label: "Rome" },
    ],
    answer: { pairs: [{ leftId: 1, rightId: 22 }] },
    review: {
      pairs: [{ leftId: 1, rightId: 22, correct: false }],
      correctPairs: [
        { leftId: 1, rightId: 21 },
        { leftId: 2, rightId: 22 },
      ],
    },
  };

  it("shows the correct right label when the pair was wrong, and none for an unpaired item", () => {
    expect(matchRows(q)).toEqual([
      { left: "France", mine: "Rome", correctRight: "Paris", correct: false },
      { left: "Italy", mine: null, correctRight: "Rome", correct: false },
    ]);
  });
});

describe("blankRows", () => {
  it("numbers the gaps from 1 with what was written and expected", () => {
    const q: Q<"FILL_BLANK"> = {
      ...base,
      type: "FILL_BLANK",
      blanks: [
        { id: 6, position: 1 },
        { id: 5, position: 0 },
      ],
      answer: { blanks: [{ blankId: 5, text: "cat" }] },
      review: {
        blanks: [
          { blankId: 5, correct: true, expected: "cat" },
          { blankId: 6, correct: false, expected: "mat" },
        ],
      },
    };
    expect(blankRows(q)).toEqual([
      { index: 1, text: "cat", expected: "cat", correct: true },
      { index: 2, text: "", expected: "mat", correct: false },
    ]);
  });
});

describe("verdictOf", () => {
  const essay = (pointsAwarded: number | null): QuizQuestionStudent => ({
    ...base,
    type: "ESSAY",
    answer: { text: "" },
    review: null,
    pointsAwarded,
  });
  it("reads the points", () => {
    expect(verdictOf(essay(null))).toBe("pending");
    expect(verdictOf(essay(0))).toBe("wrong");
    expect(verdictOf(essay(1))).toBe("partly");
    expect(verdictOf(essay(2))).toBe("right");
  });
});
