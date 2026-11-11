import type { QuizGradingAttempt } from "@space/shared";

import { formatDate, unbreakable } from "../lib/format";
import { attemptSubtitle } from "../screens/quiz-grade/attempt-subtitle";

// Spec "Honest accidents": a grading row is the latest attempt, but its score
// is the best graded one (final review M2).
const submittedAt = "2099-03-02T10:00:00.000Z";
const date = unbreakable(formatDate(submittedAt));
const row = (over: Partial<QuizGradingAttempt>): QuizGradingAttempt => ({
  attemptId: 900,
  studentUserId: 9,
  studentName: "Test student",
  attemptNumber: 1,
  status: "SUBMITTED",
  autoScore: 2,
  manualScore: null,
  totalScore: null,
  bestScore: null,
  submittedAt,
  gradedByName: null,
  endReason: null,
  endedByName: null,
  deadlineAt: null,
  events: [],
  answers: [],
  ...over,
});

describe("attemptSubtitle", () => {
  it("a first attempt awaiting grading has no score", () => {
    expect(attemptSubtitle(row({}), 7)).toBe(`Attempt 1 · Awaiting grading · ${date}`);
  });

  it("a graded attempt that is the best shows its own score, unlabelled", () => {
    expect(attemptSubtitle(row({ status: "GRADED", totalScore: 6.67, bestScore: 6.67 }), 7)).toBe(
      `Attempt 1 · 6.7/7 · ${date}`,
    );
  });

  it("a retake waiting for marking shows the earlier best", () => {
    expect(attemptSubtitle(row({ attemptNumber: 2, bestScore: 6 }), 7)).toBe(
      `Attempt 2 · Best 6/7 · Awaiting grading · ${date}`,
    );
  });

  it("a lower graded retake shows the best, not its own total", () => {
    expect(attemptSubtitle(row({ attemptNumber: 3, status: "GRADED", totalScore: 1, bestScore: 5 }), 7)).toBe(
      `Attempt 3 · Best 5/7 · ${date}`,
    );
  });
});
