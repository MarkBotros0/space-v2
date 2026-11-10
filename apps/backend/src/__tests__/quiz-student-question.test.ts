import { toStudentQuestion, type StudentAnswerRow, type StudentQuestionRow } from "../lib/quizzes/student-question";
import { seededOrder } from "../lib/quizzes/shuffle";

const KEY_MARKERS = ["isCorrect", "matchId", "expected", "correctOptionIds", "correctPairs"];

function opt(id: number, position: number, label: string, isCorrect = false, side: "LEFT" | "RIGHT" | null = null) {
  return { id, position, label, side, isCorrect, matchId: null as number | null };
}

/** Rows as the REVIEW select returns them: the key is present, so a leak would show. */
const single: StudentQuestionRow = {
  id: 10,
  order: 0,
  type: "SINGLE_CHOICE",
  prompt: "Capital of France?",
  points: 2,
  quizOptions: [opt(1, 0, "London"), opt(2, 1, "Paris", true), opt(3, 2, "Rome"), opt(4, 3, "Madrid")],
  quizBlanks: [],
  _count: { quizOptions: 1 },
};
const multi: StudentQuestionRow = {
  ...single,
  id: 11,
  type: "MULTI_CHOICE",
  quizOptions: [opt(5, 0, "2", true), opt(6, 1, "3", true), opt(7, 2, "4")],
  _count: { quizOptions: 2 },
};
const trueFalse: StudentQuestionRow = {
  ...single,
  id: 12,
  type: "TRUE_FALSE",
  quizOptions: [opt(9, 1, "False"), opt(8, 0, "True", true)],
  _count: { quizOptions: 1 },
};
const matching: StudentQuestionRow = {
  ...single,
  id: 13,
  type: "MATCHING",
  quizOptions: [
    { ...opt(20, 0, "France", false, "LEFT"), matchId: 30 },
    { ...opt(21, 1, "Italy", false, "LEFT"), matchId: 31 },
    { ...opt(22, 2, "Spain", false, "LEFT"), matchId: 32 },
    opt(30, 3, "Paris", false, "RIGHT"),
    opt(31, 4, "Rome", false, "RIGHT"),
    opt(32, 5, "Madrid", false, "RIGHT"),
  ],
  _count: { quizOptions: 0 },
};
const blanks: StudentQuestionRow = {
  ...single,
  id: 14,
  type: "FILL_BLANK",
  quizOptions: [],
  quizBlanks: [
    { id: 41, position: 1, expected: "Europe" },
    { id: 40, position: 0, expected: "France" },
  ],
  _count: { quizOptions: 0 },
};
const essay: StudentQuestionRow = { ...single, id: 15, type: "ESSAY", quizOptions: [], _count: { quizOptions: 0 } };

const ALL = [single, multi, trueFalse, matching, blanks, essay];

const graded: StudentAnswerRow = {
  selections: [{ optionId: 1, matchedOptionId: null }],
  blanks: [],
  text: null,
  isCorrect: false,
  pointsAwarded: 0,
};

describe("toStudentQuestion without review", () => {
  it.each(ALL.map((q) => [q.type, q] as const))("%s carries no answer key, even from a row that has one", (_t, q) => {
    const out = toStudentQuestion(q, graded, { seed: 7, withReview: false });
    const raw = JSON.stringify(out);
    for (const marker of KEY_MARKERS) expect(raw).not.toContain(marker);
    expect(out.review).toBeNull();
    expect(out.pointsAwarded).toBeNull();
  });

  it("shuffles single-choice options by seed and question id", () => {
    const out = toStudentQuestion(single, undefined, { seed: 7, withReview: false });
    if (out.type !== "SINGLE_CHOICE") throw new Error("type");
    expect(out.options.map((o) => o.id)).toEqual(seededOrder(single.quizOptions, 7, 10).map((o) => o.id));
    expect(out.options[0]).toEqual({ id: expect.any(Number), label: expect.any(String) });
    expect(out.answer).toEqual({ optionId: null });
  });

  it("keeps true/false in position order and says how many to choose for multi", () => {
    const tf = toStudentQuestion(trueFalse, undefined, { seed: 7, withReview: false });
    if (tf.type !== "TRUE_FALSE") throw new Error("type");
    expect(tf.options.map((o) => o.label)).toEqual(["True", "False"]);
    const m = toStudentQuestion(multi, undefined, { seed: 7, withReview: false });
    if (m.type !== "MULTI_CHOICE") throw new Error("type");
    expect(m.choose).toBe(2);
    expect(m.answer).toEqual({ optionIds: [] });
  });

  it("shuffles the two matching columns with different salts", () => {
    const out = toStudentQuestion(matching, undefined, { seed: 7, withReview: false });
    if (out.type !== "MATCHING") throw new Error("type");
    const lefts = matching.quizOptions.filter((o) => o.side === "LEFT");
    const rights = matching.quizOptions.filter((o) => o.side === "RIGHT");
    expect(out.left.map((o) => o.id)).toEqual(seededOrder(lefts, 7, 13).map((o) => o.id));
    expect(out.right.map((o) => o.id)).toEqual(seededOrder(rights, 7, 13 + 1_000_003).map((o) => o.id));
  });

  it("lists blanks in position order without the expected text, with the student's own text", () => {
    const out = toStudentQuestion(
      blanks,
      { selections: [], blanks: [{ blankId: 41, text: "Asia" }], text: null },
      { seed: 7, withReview: false },
    );
    if (out.type !== "FILL_BLANK") throw new Error("type");
    expect(out.blanks).toEqual([
      { id: 40, position: 0 },
      { id: 41, position: 1 },
    ]);
    expect(out.answer).toEqual({ blanks: [{ blankId: 41, text: "Asia" }] });
  });
});

describe("toStudentQuestion with review", () => {
  it("shows the correct options and the points", () => {
    const out = toStudentQuestion(single, graded, { seed: 7, withReview: true });
    expect(out.review).toEqual({ correctOptionIds: [2] });
    expect(out.pointsAwarded).toBe(0);
    expect(out.answer).toEqual({ optionId: 1 });
  });

  it("marks each matching pair and gives the correct pairs", () => {
    const out = toStudentQuestion(
      matching,
      {
        selections: [
          { optionId: 20, matchedOptionId: 30 },
          { optionId: 21, matchedOptionId: 32 },
        ],
        blanks: [],
        text: null,
        isCorrect: false,
        pointsAwarded: 1.33,
      },
      { seed: 7, withReview: true },
    );
    expect(out.review).toEqual({
      pairs: [
        { leftId: 20, rightId: 30, correct: true },
        { leftId: 21, rightId: 32, correct: false },
      ],
      correctPairs: [
        { leftId: 20, rightId: 30 },
        { leftId: 21, rightId: 31 },
        { leftId: 22, rightId: 32 },
      ],
    });
  });

  it("marks each blank and gives the expected answer", () => {
    const out = toStudentQuestion(
      blanks,
      {
        selections: [],
        blanks: [
          { blankId: 40, text: "France", isCorrect: true },
          { blankId: 41, text: "Asia", isCorrect: false },
        ],
        text: null,
        isCorrect: null,
        pointsAwarded: 1,
      },
      { seed: 7, withReview: true },
    );
    expect(out.review).toEqual({
      blanks: [
        { blankId: 40, correct: true, expected: "France" },
        { blankId: 41, correct: false, expected: "Europe" },
      ],
    });
  });

  it("gives an essay its right/wrong", () => {
    const out = toStudentQuestion(
      essay,
      { selections: [], blanks: [], text: "Because.", isCorrect: true, pointsAwarded: 2 },
      { seed: 7, withReview: true },
    );
    expect(out.review).toEqual({ correct: true });
    expect(out.answer).toEqual({ text: "Because." });
  });

  it("refuses to review from a row loaded without the key", () => {
    const keyless = {
      ...single,
      quizOptions: single.quizOptions.map(({ id, position, label, side }) => ({ id, position, label, side })),
    };
    expect(() => toStudentQuestion(keyless, graded, { seed: 7, withReview: true })).toThrow();
  });
});
