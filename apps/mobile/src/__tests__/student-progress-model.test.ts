import type { StudentProgress } from "@space/shared";

import {
  assignmentAction,
  assignmentStanding,
  progressCaptions,
  progressLines,
  progressSpoken,
  quizAction,
  quizLine,
} from "../screens/student-detail/progress-model";

const progress = (numbers: Partial<StudentProgress["numbers"]> = {}): StudentProgress => ({
  seasonId: 7,
  seasonTitle: "Spring 2099",
  seasonActive: true,
  canMark: true,
  available: { attendance: true, assignments: true, quizzes: true },
  numbers: {
    attendance: { attended: 17, total: 20 },
    assignments: { submitted: 7, total: 9 },
    quizzes: { scored: 3.6, max: 5 },
    ...numbers,
  },
  assignments: [],
  quizzes: [],
});

describe("progressLines", () => {
  it("gives each number its percent and exact figure", () => {
    expect(progressLines(progress())).toEqual([
      { key: "attendance", label: "Attendance", pct: 85, figure: "17 of 20 sessions" },
      { key: "assignments", label: "Assignments", pct: 78, figure: "7 / 9" },
      { key: "quizzes", label: "Quizzes", pct: 72, figure: "average of 5 quizzes" },
    ]);
  });

  it("every quiz weighs the same: the average percent, and one quiz in the singular", () => {
    // 100%, 25% and 100% average 75%, whatever each quiz's points.
    expect(progressLines(progress({ quizzes: { scored: 2.25, max: 3 } }))[2]).toEqual({
      key: "quizzes",
      label: "Quizzes",
      pct: 75,
      figure: "average of 3 quizzes",
    });
    expect(progressLines(progress({ quizzes: { scored: 0.725, max: 1 } }))[2]?.figure).toBe("average of 1 quiz");
  });

  it("says one session, not one sessions", () => {
    expect(progressLines(progress({ attendance: { attended: 1, total: 1 } }))[0]!.figure).toBe("1 of 1 session");
  });

  it("a zero denominator has no percent and reads None this season", () => {
    const lines = progressLines(
      progress({
        attendance: { attended: 0, total: 0 },
        assignments: { submitted: 0, total: 0 },
        quizzes: { scored: 0, max: 0 },
      }),
    );
    for (const line of lines) {
      expect(line.pct).toBeNull();
      expect(line.figure).toBe("None this season");
    }
  });

  it("speaks a figure as words", () => {
    const [attendance, assignments] = progressLines(progress());
    expect(progressSpoken(attendance!)).toBe("Attendance 85%, 17 of 20 sessions");
    expect(progressSpoken(assignments!)).toBe("Assignments 78%, 7 of 9 submitted");
    expect(progressSpoken({ key: "quizzes", label: "Quizzes", pct: null, figure: "None this season" })).toBe(
      "Quizzes, None this season",
    );
  });
});

describe("progressCaptions (the students list)", () => {
  it("reads each number with its percent", () => {
    expect(progressCaptions({ attendancePct: 85, assignmentsPct: 78, quizPct: 72 })).toEqual([
      "Attendance 85%",
      "Assignments 78%",
      "Quizzes 72%",
    ]);
  });

  it("says a number with nothing to count in words", () => {
    expect(progressCaptions({ attendancePct: 85, assignmentsPct: null, quizPct: 0 })).toEqual([
      "Attendance 85%",
      "Assignments: none this season",
      "Quizzes 0%",
    ]);
    expect(progressCaptions({ attendancePct: null, assignmentsPct: null, quizPct: null })).toEqual([
      "None this season",
    ]);
  });

  it("shows nothing without progress (alumni, a mentor's list)", () => {
    expect(progressCaptions(null)).toEqual([]);
    expect(progressCaptions(undefined)).toEqual([]);
  });
});

type Assignment = StudentProgress["assignments"][number];
const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: 41,
  title: "Week one",
  dueAt: null,
  submitted: null,
  staffMark: null,
  ...over,
});

describe("assignments in the sheet", () => {
  it("names the standing in words", () => {
    expect(assignmentStanding(assignment())).toEqual({ tone: "bad", label: "Not submitted" });
    expect(assignmentStanding(assignment({ submitted: "app" }))).toEqual({ tone: "ok", label: "Submitted" });
    expect(
      assignmentStanding(
        assignment({ submitted: "staff", staffMark: { markedAt: "2099-03-01T10:00:00.000Z", markedByName: "Grace" } }),
      ),
    ).toEqual({ tone: "ok", label: "Marked submitted" });
  });

  it("offers a mark on a missing one, undo on a staff mark, nothing on an app submission", () => {
    const mark = { markedAt: "2099-03-01T10:00:00.000Z", markedByName: "Grace" };
    expect(assignmentAction(assignment(), true)).toBe("mark");
    expect(assignmentAction(assignment({ submitted: "staff", staffMark: mark }), true)).toBe("undo");
    expect(assignmentAction(assignment({ submitted: "app", staffMark: mark }), true)).toBeNull();
    expect(assignmentAction(assignment(), false)).toBeNull();
  });
});

type Quiz = StudentProgress["quizzes"][number];
const quiz = (over: Partial<Quiz> = {}): Quiz => ({
  id: 9,
  title: "Quiz one",
  kind: "ONLINE",
  score: 4.5,
  maxScore: 10,
  ...over,
});

describe("quizzes in the sheet", () => {
  it("reads the score with its marks and percent", () => {
    expect(quizLine(quiz())).toBe("4.5 of 10 marks, 45%");
    expect(quizLine(quiz({ score: null }))).toBe("No score yet, counts as 0");
  });

  it("offers Reopen retake on a taken online quiz, the grading screen otherwise, nothing once ended", () => {
    expect(quizAction(quiz(), true)).toBe("Reopen retake");
    expect(quizAction(quiz({ score: null }), true)).toBe("Open grading");
    expect(quizAction(quiz({ kind: "PAPER" }), true)).toBe("Open grading");
    expect(quizAction(quiz(), false)).toBeNull();
  });
});
