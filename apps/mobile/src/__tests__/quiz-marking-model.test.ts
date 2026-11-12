import type { QuizGradingAttempt } from "@space/shared";

import {
  initialMarks,
  isLeftEmpty,
  markedCount,
  marksComplete,
  setMark,
  setPoints,
  toMarkInput,
  type ItemMark,
} from "../screens/quiz-grade/marking-model";

const blank = (blankId: number, correct: boolean | null): ItemMark => ({
  questionId: 2,
  blankId,
  correct,
  points: null,
  max: 0,
});
const essayMark = (points: number | null): ItemMark => ({
  questionId: 3,
  blankId: null,
  correct: null,
  points,
  max: 5,
});

type Answer = QuizGradingAttempt["answers"][number];

const single: Answer = {
  questionId: 1,
  type: "SINGLE_CHOICE",
  prompt: "Capital of France?",
  points: 2,
  pointsAwarded: 2,
  options: [
    { id: 11, label: "London", isCorrect: false },
    { id: 12, label: "Paris", isCorrect: true },
  ],
  selectedOptionId: 12,
};

const blanks: Answer = {
  questionId: 2,
  type: "FILL_BLANK",
  prompt: "Water is [[1]] and ice is [[2]], steam is [[3]].",
  points: 3,
  pointsAwarded: null,
  blanks: [
    { blankId: 21, position: 0, expected: "wet", text: "wet", correct: null },
    { blankId: 22, position: 1, expected: "cold", text: "cool", correct: true },
    { blankId: 23, position: 2, expected: "hot", text: "warm", correct: null },
  ],
};

const essay: Answer = {
  questionId: 3,
  type: "ESSAY",
  prompt: "Discuss.",
  points: 5,
  pointsAwarded: null,
  text: "Because of the river.",
  correct: null,
};

function attempt(answers: Answer[]): QuizGradingAttempt {
  return {
    attemptId: 900,
    studentUserId: 9,
    studentName: "Test student",
    attemptNumber: 1,
    status: "SUBMITTED",
    autoScore: 2,
    manualScore: null,
    totalScore: null,
    bestScore: null,
    adminScore: null,
    appScore: null,
    submittedAt: "2099-03-02T10:00:00.000Z",
    gradedByName: null,
    endReason: null,
    endedByName: null,
    deadlineAt: null,
    events: [],
    answers,
  };
}

describe("marking model", () => {
  it("seeds one mark per blank and per essay from what the server holds, none for auto types", () => {
    expect(initialMarks(attempt([single, blanks, essay]))).toEqual([
      blank(21, null),
      blank(22, true),
      blank(23, null),
      essayMark(null),
    ]);
    // An essay already marked comes back with its points, whole and within its points.
    expect(initialMarks(attempt([{ ...essay, pointsAwarded: 3 }]))).toEqual([essayMark(3)]);
    expect(initialMarks(attempt([{ ...essay, pointsAwarded: 2.5 }]))).toEqual([essayMark(3)]);
  });

  it("never offers a blank or essay the student left empty: the server marked it wrong at close", () => {
    const partly: Answer = {
      ...blanks,
      blanks: [
        { blankId: 21, position: 0, expected: "wet", text: "wet", correct: null },
        { blankId: 22, position: 1, expected: "cold", text: "  ", correct: false },
        { blankId: 23, position: 2, expected: "hot", text: null, correct: false },
      ],
    };
    const emptyEssay: Answer = { ...essay, text: null, correct: false, pointsAwarded: 0 };
    const marks = initialMarks(attempt([single, partly, emptyEssay]));
    expect(marks).toEqual([blank(21, null)]);
    expect(marksComplete(setMark(marks, 2, 21, true))).toBe(true);
    expect(isLeftEmpty("")).toBe(true);
    expect(isLeftEmpty("ماء")).toBe(false);
  });

  it("is not complete while one blank is unmarked", () => {
    const a = attempt([blanks, essay]);
    let marks = initialMarks(a);
    marks = setMark(marks, 2, 21, true);
    marks = setPoints(marks, 3, 0);
    expect(markedCount(marks)).toBe(3);
    expect(marksComplete(marks)).toBe(false);
    marks = setMark(marks, 2, 23, false);
    expect(marksComplete(marks)).toBe(true);
  });

  it("turns marks into right or wrong per blank and the points for an essay", () => {
    const marks = [blank(21, true), blank(22, false), blank(23, true), essayMark(2)];
    expect(toMarkInput(marks)).toEqual({
      marks: [
        { questionId: 2, blankId: 21, correct: true },
        { questionId: 2, blankId: 22, correct: false },
        { questionId: 2, blankId: 23, correct: true },
        { questionId: 3, blankId: null, points: 2 },
      ],
    });
  });

  it("keeps an essay's points whole and between 0 and its points", () => {
    expect(setPoints([essayMark(null)], 3, 7)[0]?.points).toBe(5);
    expect(setPoints([essayMark(null)], 3, -1)[0]?.points).toBe(0);
    expect(setPoints([essayMark(null)], 3, 1)[0]?.points).toBe(1);
  });

  it("refuses to build a payload with an unmarked item", () => {
    expect(() => toMarkInput([essayMark(null)])).toThrow();
    expect(() => toMarkInput([blank(21, null)])).toThrow();
  });
});
