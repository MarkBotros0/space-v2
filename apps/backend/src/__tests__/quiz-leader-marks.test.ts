/**
 * planLeaderMarks: a leader's right/wrong marks checked against the attempt's
 * leader-marked questions (one per ESSAY, one per FILL_BLANK blank) and turned
 * into points.
 */
jest.mock("../db/client", () => ({ db: {} }));

import { planLeaderMarks } from "../lib/quizzes/grading";
import type { MarkableQuestion } from "../lib/quizzes/marking";

const fill: MarkableQuestion = {
  id: 1,
  type: "FILL_BLANK",
  points: 3,
  options: [],
  blanks: [{ id: 11 }, { id: 12 }, { id: 13 }],
};
const essay: MarkableQuestion = { id: 2, type: "ESSAY", points: 5, options: [], blanks: [] };
const all = [fill, essay];
const blank = (blankId: number, correct: boolean) => ({ questionId: 1, blankId, correct });
const essayMark = (correct: boolean) => ({ questionId: 2, blankId: null, correct });

describe("planLeaderMarks", () => {
  it("gives 2 of 3 blanks 2/3 of the points and a wrong essay 0", () => {
    const plan = planLeaderMarks(all, [blank(11, true), blank(12, true), blank(13, false), essayMark(false)]);
    if ("refusal" in plan) throw new Error(plan.refusal.code);
    expect(plan.rows).toEqual([
      {
        questionId: 1,
        pointsAwarded: 2,
        isCorrect: false,
        blankMarks: [
          { blankId: 11, correct: true },
          { blankId: 12, correct: true },
          { blankId: 13, correct: false },
        ],
      },
      { questionId: 2, pointsAwarded: 0, isCorrect: false, blankMarks: [] },
    ]);
    expect(plan.manualScore).toBe(2);
  });

  it("refuses a missing blank as marks_incomplete (409)", () => {
    const plan = planLeaderMarks(all, [blank(11, true), blank(12, true), essayMark(true)]);
    expect("refusal" in plan && plan.refusal).toMatchObject({ code: "marks_incomplete", status: 409 });
  });

  it("refuses a missing essay mark as marks_incomplete", () => {
    const plan = planLeaderMarks(all, [blank(11, true), blank(12, true), blank(13, true)]);
    expect("refusal" in plan && plan.refusal.code).toBe("marks_incomplete");
  });

  it("refuses the same item marked twice as mark_out_of_range (400)", () => {
    const twice = [blank(11, true), blank(11, false), blank(12, true), blank(13, true), essayMark(true)];
    expect("refusal" in planLeaderMarks(all, twice) && planLeaderMarks(all, twice)).toMatchObject({
      refusal: { code: "mark_out_of_range", status: 400 },
    });
    const essayTwice = [blank(11, true), blank(12, true), blank(13, true), essayMark(true), essayMark(false)];
    expect("refusal" in planLeaderMarks(all, essayTwice)).toBe(true);
  });

  it("refuses a blank of another question, a blank on an essay and a question that is not leader-marked", () => {
    const base = [blank(11, true), blank(12, true), blank(13, true), essayMark(true)];
    for (const stray of [
      { questionId: 1, blankId: 99, correct: true },
      { questionId: 1, blankId: null, correct: true },
      { questionId: 2, blankId: 11, correct: true },
      { questionId: 7, blankId: null, correct: true },
    ]) {
      const plan = planLeaderMarks(all, [...base, stray]);
      expect("refusal" in plan && plan.refusal.code).toBe("mark_out_of_range");
    }
  });

  it("marks a fully right fill-blank as correct with full points", () => {
    const plan = planLeaderMarks([fill], [blank(11, true), blank(12, true), blank(13, true)]);
    if ("refusal" in plan) throw new Error(plan.refusal.code);
    expect(plan.rows[0]).toMatchObject({ pointsAwarded: 3, isCorrect: true });
    expect(plan.manualScore).toBe(3);
  });
});
