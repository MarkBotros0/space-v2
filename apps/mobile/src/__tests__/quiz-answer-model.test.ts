import { quizAnswerInputSchema, type QuizQuestionStudent } from "@space/shared";

import { isAnswered, pairUp, toAnswerInput, toggleChoice, unpair } from "../screens/quiz-detail/answer-model";

const base = { order: 1, prompt: "Q", points: 1, pointsAwarded: null, review: null };
const opts = [
  { id: 1, label: "a" },
  { id: 2, label: "b" },
  { id: 3, label: "c" },
];

const single: QuizQuestionStudent = {
  ...base,
  id: 10,
  type: "SINGLE_CHOICE",
  options: opts,
  answer: { optionId: null },
};
const tf: QuizQuestionStudent = { ...single, id: 11, type: "TRUE_FALSE" };
const multi: QuizQuestionStudent = {
  ...base,
  id: 12,
  type: "MULTI_CHOICE",
  options: opts,
  choose: 2,
  answer: { optionIds: [] },
};
const matching: QuizQuestionStudent = {
  ...base,
  id: 13,
  type: "MATCHING",
  left: [
    { id: 1, label: "l1" },
    { id: 2, label: "l2" },
  ],
  right: [
    { id: 5, label: "r1" },
    { id: 6, label: "r2" },
  ],
  answer: { pairs: [] },
};
const blanks: QuizQuestionStudent = {
  ...base,
  id: 14,
  type: "FILL_BLANK",
  blanks: [
    { id: 7, position: 0 },
    { id: 8, position: 1 },
  ],
  answer: { blanks: [] },
};
const essay: QuizQuestionStudent = { ...base, id: 15, type: "ESSAY", answer: { text: "" } };

describe("toggleChoice", () => {
  it("does not tick past choose", () => {
    expect(toggleChoice({ optionIds: [1, 2] }, 3, 2)).toEqual({ optionIds: [1, 2] });
  });
  it("ticks while there is room", () => {
    expect(toggleChoice({ optionIds: [1] }, 3, 2)).toEqual({ optionIds: [1, 3] });
  });
  it("untick frees a slot", () => {
    const freed = toggleChoice({ optionIds: [1, 2] }, 1, 2);
    expect(freed).toEqual({ optionIds: [2] });
    expect(toggleChoice(freed, 3, 2)).toEqual({ optionIds: [2, 3] });
  });
});

describe("pairUp / unpair", () => {
  it("moving a right item to a new left removes the old pair", () => {
    const a = pairUp({ pairs: [{ leftId: 1, rightId: 5 }] }, 2, 5);
    expect(a.pairs).toEqual([{ leftId: 2, rightId: 5 }]);
  });
  it("re-pairing a left replaces its pair", () => {
    const a = pairUp({ pairs: [{ leftId: 1, rightId: 5 }] }, 1, 6);
    expect(a.pairs).toEqual([{ leftId: 1, rightId: 6 }]);
  });
  it("unpair removes the left's pair", () => {
    expect(
      unpair(
        {
          pairs: [
            { leftId: 1, rightId: 5 },
            { leftId: 2, rightId: 6 },
          ],
        },
        1,
      ).pairs,
    ).toEqual([{ leftId: 2, rightId: 6 }]);
  });
});

describe("isAnswered", () => {
  it("single and true/false need one selection", () => {
    expect(isAnswered(single, { optionId: null })).toBe(false);
    expect(isAnswered(single, { optionId: 1 })).toBe(true);
    expect(isAnswered(tf, { optionId: 2 })).toBe(true);
  });
  it("multi needs at least one", () => {
    expect(isAnswered(multi, { optionIds: [] })).toBe(false);
    expect(isAnswered(multi, { optionIds: [1] })).toBe(true);
  });
  it("matching needs every left paired", () => {
    expect(isAnswered(matching, { pairs: [{ leftId: 1, rightId: 5 }] })).toBe(false);
    expect(
      isAnswered(matching, {
        pairs: [
          { leftId: 1, rightId: 5 },
          { leftId: 2, rightId: 6 },
        ],
      }),
    ).toBe(true);
  });
  it("blanks need every blank non-blank", () => {
    expect(isAnswered(blanks, { blanks: [{ blankId: 7, text: "x" }] })).toBe(false);
    expect(
      isAnswered(blanks, {
        blanks: [
          { blankId: 7, text: "x" },
          { blankId: 8, text: "  " },
        ],
      }),
    ).toBe(false);
    expect(
      isAnswered(blanks, {
        blanks: [
          { blankId: 7, text: "x" },
          { blankId: 8, text: "y" },
        ],
      }),
    ).toBe(true);
  });
  it("essay needs non-blank text", () => {
    expect(isAnswered(essay, { text: "  " })).toBe(false);
    expect(isAnswered(essay, { text: "hi" })).toBe(true);
  });
});

describe("toAnswerInput", () => {
  const cases: [QuizQuestionStudent, Parameters<typeof toAnswerInput>[1]][] = [
    [single, { optionId: 2 }],
    [single, { optionId: null }],
    [tf, { optionId: 1 }],
    [multi, { optionIds: [1, 3] }],
    [matching, { pairs: [{ leftId: 1, rightId: 6 }] }],
    [
      blanks,
      {
        blanks: [
          { blankId: 7, text: "x" },
          { blankId: 8, text: "" },
        ],
      },
    ],
    [essay, { text: "words" }],
  ];
  it.each(cases)("%# parses against quizAnswerInputSchema", (q, a) => {
    const input = toAnswerInput(q, a);
    expect(input.questionId).toBe(q.id);
    expect(input.type).toBe(q.type);
    expect(quizAnswerInputSchema.parse(input)).toEqual(input);
  });
  it("blanks cover every blank, in blank order", () => {
    const input = toAnswerInput(blanks, { blanks: [{ blankId: 8, text: "y" }] });
    expect(input).toEqual({
      type: "FILL_BLANK",
      questionId: 14,
      blanks: [
        { blankId: 7, text: "" },
        { blankId: 8, text: "y" },
      ],
    });
  });
});
