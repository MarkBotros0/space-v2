import type { QuizGradingAttempt } from "@space/shared";

import {
  hasLegacyMarks,
  initialMarks,
  isLeftEmpty,
  isLegacyEssay,
  markedCount,
  marksComplete,
  setMark,
  toMarkInput,
} from "../screens/quiz-grade/marking-model";

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
    submittedAt: "2099-03-02T10:00:00.000Z",
    gradedByName: null,
    answers,
  };
}

describe("marking model", () => {
  it("seeds one mark per blank and per essay from what the server holds, none for auto types", () => {
    expect(initialMarks(attempt([single, blanks, essay]))).toEqual([
      { questionId: 2, blankId: 21, correct: null },
      { questionId: 2, blankId: 22, correct: true },
      { questionId: 2, blankId: 23, correct: null },
      { questionId: 3, blankId: null, correct: null },
    ]);
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
    expect(marks).toEqual([{ questionId: 2, blankId: 21, correct: null }]);
    expect(marksComplete(setMark(marks, 2, 21, true))).toBe(true);
    expect(isLeftEmpty("")).toBe(true);
    expect(isLeftEmpty("ماء")).toBe(false);
  });

  it("is not complete while one blank is unmarked", () => {
    const a = attempt([blanks, essay]);
    let marks = initialMarks(a);
    marks = setMark(marks, 2, 21, true);
    marks = setMark(marks, 3, null, false);
    expect(markedCount(marks)).toBe(3);
    expect(marksComplete(marks)).toBe(false);
    marks = setMark(marks, 2, 23, false);
    expect(marksComplete(marks)).toBe(true);
  });

  it("turns marks into one per blank and blankId null for an essay", () => {
    const marks = [
      { questionId: 2, blankId: 21, correct: true },
      { questionId: 2, blankId: 22, correct: false },
      { questionId: 2, blankId: 23, correct: true },
      { questionId: 3, blankId: null, correct: false },
    ];
    expect(toMarkInput(marks)).toEqual({
      marks: [
        { questionId: 2, blankId: 21, correct: true },
        { questionId: 2, blankId: 22, correct: false },
        { questionId: 2, blankId: 23, correct: true },
        { questionId: 3, blankId: null, correct: false },
      ],
    });
  });

  it("refuses to build a payload with an unmarked item", () => {
    expect(() => toMarkInput([{ questionId: 3, blankId: null, correct: null }])).toThrow();
  });

  it("knows a legacy essay by points that are neither none nor full", () => {
    expect(isLegacyEssay({ ...essay, pointsAwarded: 3, correct: true })).toBe(true);
    expect(isLegacyEssay({ ...essay, pointsAwarded: 5, correct: true })).toBe(false);
    expect(isLegacyEssay({ ...essay, pointsAwarded: 0, correct: false })).toBe(false);
    expect(isLegacyEssay(essay)).toBe(false);
    expect(hasLegacyMarks(attempt([single, { ...essay, pointsAwarded: 3, correct: true }]))).toBe(true);
    expect(hasLegacyMarks(attempt([single, essay]))).toBe(false);
  });
});
