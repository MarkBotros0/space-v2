import type { QuizGradingAttempt, QuizGradingPage } from "@space/shared";

import { manualScoreAppStatus, parseManualScore } from "../screens/quiz-grade/manual-score-model";

const item = (over: Partial<QuizGradingAttempt>): QuizGradingAttempt => ({
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
  answers: [],
  ...over,
});

const waiting = (startedAt: string | null): QuizGradingPage["waiting"][number] => ({
  studentUserId: 10,
  studentName: "Second student",
  startedAt,
  endReason: null,
  endedByName: null,
  deadlineAt: null,
  adminScore: null,
  appScore: null,
});

const admin = { score: 4, notes: null, gradedAt: "2099-03-03T10:00:00.000Z", gradedByName: "Test admin" };

describe("manualScoreAppStatus", () => {
  it("a graded attempt says its app score", () => {
    expect(manualScoreAppStatus(item({ status: "GRADED", totalScore: 7, bestScore: 7, appScore: 7 }), 10)).toBe(
      "Graded in the app: 7 / 10",
    );
  });

  it("a retake waiting for marking still says the earlier graded score", () => {
    expect(manualScoreAppStatus(item({ attemptNumber: 2, bestScore: 6.5, appScore: 6.5 }), 10)).toBe(
      "Graded in the app: 6.5 / 10",
    );
  });

  it("with an admin score, the app score is the app's best graded attempt, never the admin's", () => {
    // An earlier attempt graded 9, the latest handed in: bestScore is the admin's 4.
    const retake = item({ attemptNumber: 2, bestScore: 4, appScore: 9, adminScore: admin });
    expect(manualScoreAppStatus(retake, 10)).toBe("Graded in the app: 9 / 10");
    expect(manualScoreAppStatus(item({ bestScore: 4, adminScore: admin }), 10)).toBe("Waiting for marking");
  });

  it("a submitted attempt with nothing graded is waiting for marking", () => {
    expect(manualScoreAppStatus(item({}), 10)).toBe("Waiting for marking");
  });

  it("a waiting student is in progress or didn't take it", () => {
    expect(manualScoreAppStatus(waiting("2099-03-02T09:00:00.000Z"), 10)).toBe("In progress");
    expect(manualScoreAppStatus(waiting(null), 10)).toBe("Didn't take it");
    expect(manualScoreAppStatus(item({ status: "IN_PROGRESS" }), 10)).toBe("In progress");
  });
});

describe("parseManualScore", () => {
  it("accepts a point or a comma as the decimal mark", () => {
    expect(parseManualScore("7.5", 10)).toEqual({ ok: true, score: 7.5 });
    expect(parseManualScore("7,5", 10)).toEqual({ ok: true, score: 7.5 });
    expect(parseManualScore(" 8 ", 10)).toEqual({ ok: true, score: 8 });
    expect(parseManualScore("0", 10)).toEqual({ ok: true, score: 0 });
    expect(parseManualScore("10", 10)).toEqual({ ok: true, score: 10 });
    expect(parseManualScore("7.25", 10)).toEqual({ ok: true, score: 7.25 });
  });

  it("refuses an empty, negative, non-numeric or too-high score", () => {
    for (const text of ["", "  ", "-1", "abc", "10.5", "7..5", "7,5,1"]) {
      expect(parseManualScore(text, 10)).toEqual({ ok: false, error: "Enter a score from 0 to 10." });
    }
  });

  it("refuses more than two decimals", () => {
    expect(parseManualScore("7.555", 10)).toEqual({ ok: false, error: "Use at most two decimals." });
  });
});
