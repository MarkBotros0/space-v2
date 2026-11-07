import type { DashboardDueItem, StudentQuizResult } from "@space/shared";

import {
  WORK_HREF,
  assignmentRow,
  isOpenQuiz,
  quizRow,
  todayWork,
  workSections,
} from "../screens/work/work-model";

const TODAY = "2099-03-01";

const assignment = (over: Partial<DashboardDueItem> & { id: number }): DashboardDueItem => ({
  title: `Assignment ${over.id}`,
  dueAt: "2099-03-03T10:00:00.000Z",
  dueOrgDay: "2099-03-03",
  isOverdue: false,
  status: "PENDING",
  reviewedAt: null,
  ...over,
});

const quiz = (over: Partial<StudentQuizResult> & { quizId: number }): StudentQuizResult => ({
  title: `Quiz ${over.quizId}`,
  kind: "ONLINE",
  resultsReleased: true,
  maxScore: 10,
  score: null,
  notes: null,
  gradedAt: null,
  sessionTitle: null,
  sessionDate: null,
  attemptStatus: null,
  ...over,
});

describe("assignmentRow", () => {
  it("links to the assignment and keys by kind and id", () => {
    const row = assignmentRow(assignment({ id: 4 }), TODAY);
    expect(row).toMatchObject({ key: "assignment-4", kind: "assignment", id: 4, title: "Assignment 4" });
    expect(row.href).toEqual({ pathname: "/assignment/[id]", params: { id: "4" } });
  });

  it("an open row carries the due chip from the server's fields", () => {
    expect(assignmentRow(assignment({ id: 1 }), TODAY).chip).toEqual({ tone: "warn", label: "Due in 2 days" });
    expect(assignmentRow(assignment({ id: 1, isOverdue: true }), TODAY).chip).toEqual({
      tone: "bad",
      label: "Overdue",
    });
  });

  it("a draft keeps the due chip and says it is in progress", () => {
    const row = assignmentRow(assignment({ id: 1, status: "DRAFT" }), TODAY);
    expect(row.chip?.label).toBe("Due in 2 days");
    expect(row.subtitle).toBe("In progress · Due Mar 3, 2099");
  });

  it("a returned row says so, even past its due date", () => {
    const row = assignmentRow(assignment({ id: 1, status: "RETURNED", isOverdue: true }), TODAY);
    expect(row.chip).toEqual({ tone: "warn", label: "Returned" });
    expect(row.subtitle).toBe("Returned with comments · Due Mar 3, 2099");
  });

  it.each([
    ["SUBMITTED", "Submitted"],
    ["REVIEWED", "Reviewed"],
  ] as const)("%s chips its status, and the subtitle keeps the date it was due", (status, label) => {
    const row = assignmentRow(assignment({ id: 1, status, isOverdue: true }), TODAY);
    expect(row.chip?.label).toBe(label);
    expect(row.subtitle).toBe("Due Mar 3, 2099");
  });

  it("an overdue row says when it was due: the chip alone does not", () => {
    const row = assignmentRow(
      assignment({ id: 1, isOverdue: true, dueOrgDay: "2099-02-20", dueAt: "2099-02-20T10:00:00.000Z" }),
      TODAY,
    );
    expect(row.chip?.label).toBe("Overdue");
    expect(row.subtitle).toBe("Due Feb 20, 2099");
  });

  it("a chip that already names the date does not repeat it in the subtitle", () => {
    const row = assignmentRow(
      assignment({ id: 1, dueOrgDay: "2099-03-20", dueAt: "2099-03-20T10:00:00.000Z" }),
      TODAY,
    );
    expect(row.chip?.label).toBe("Due Mar 20");
    expect(row.subtitle).toBeUndefined();
    const draft = assignmentRow(
      assignment({ id: 2, status: "DRAFT", dueOrgDay: "2099-03-20", dueAt: "2099-03-20T10:00:00.000Z" }),
      TODAY,
    );
    expect(draft.subtitle).toBe("In progress");
  });

  it("a date chip across a year boundary keeps the year in the subtitle", () => {
    const row = assignmentRow(
      assignment({ id: 1, dueOrgDay: "2100-01-20", dueAt: "2100-01-20T10:00:00.000Z" }),
      TODAY,
    );
    expect(row.chip?.label).toBe("Due Jan 20");
    expect(row.subtitle).toBe("Due Jan 20, 2100");
  });

  it("a weekday chip is relative wording, so the date stays", () => {
    const row = assignmentRow(
      assignment({ id: 1, dueOrgDay: "2099-03-06", dueAt: "2099-03-06T10:00:00.000Z" }),
      TODAY,
    );
    expect(row.chip?.label).toBe("Due Friday");
    expect(row.subtitle).toBe("Due Mar 6, 2099");
  });

  it("the date comes from the org day, never dueAt: the two can name different days", () => {
    const row = assignmentRow(
      assignment({ id: 1, isOverdue: true, dueOrgDay: "2099-02-01", dueAt: "2099-01-31T22:30:00.000Z" }),
      TODAY,
    );
    expect(row.subtitle).toBe("Due Feb 1, 2099");
  });

  it.each([
    ["PENDING", undefined],
    ["SUBMITTED", undefined],
    ["REVIEWED", undefined],
    ["DRAFT", "In progress"],
    ["RETURNED", "Returned with comments"],
  ] as const)("an undated %s row names no date", (status, subtitle) => {
    const row = assignmentRow(assignment({ id: 1, status, dueOrgDay: null, dueAt: null }), TODAY);
    expect(row.subtitle).toBe(subtitle);
  });
});

describe("quizRow", () => {
  it("never started: Take quiz, linking to the quiz", () => {
    const row = quizRow(quiz({ quizId: 5 }));
    expect(row).toMatchObject({ key: "quiz-ONLINE-5", kind: "quiz", id: 5, chip: { tone: "info", label: "Take quiz" } });
    expect(row.href).toEqual({ pathname: "/quiz/[id]", params: { id: "5" } });
  });

  it("in progress: Resume", () => {
    expect(quizRow(quiz({ quizId: 5, attemptStatus: "IN_PROGRESS" })).chip).toEqual({ tone: "warn", label: "Resume" });
  });

  it("submitted without a score: Awaiting grading", () => {
    expect(quizRow(quiz({ quizId: 5, attemptStatus: "SUBMITTED" })).chip).toEqual({
      tone: "neutral",
      label: "Awaiting grading",
    });
  });

  it("paper without a score: Pending, and not a link", () => {
    const row = quizRow(quiz({ quizId: 5, kind: "PAPER" }));
    expect(row.chip).toEqual({ tone: "neutral", label: "Pending" });
    expect(row.href).toBeNull();
    expect(row.key).toBe("quiz-PAPER-5");
  });

  it("scored: score in the trailing, graded date in the subtitle without repeating the percent, no chip", () => {
    const row = quizRow(
      quiz({ quizId: 5, score: 8, gradedAt: "2099-03-02T12:00:00.000Z", attemptStatus: "GRADED", notes: "Nice" }),
    );
    expect(row.score).toBe("8/10");
    expect(row.chip).toBeUndefined();
    expect(row.subtitle).toBe("Graded\u00A0Mar\u00A02,\u00A02099 · Nice");
  });

  it("a scored paper quiz stays a plain row; a zero-point quiz does not divide by zero", () => {
    const row = quizRow(quiz({ quizId: 5, kind: "PAPER", score: 0, maxScore: 0 }));
    expect(row.href).toBeNull();
    expect(row.score).toBe("0/0");
    expect(row.subtitle).toBeUndefined();
  });

  it("names the session the quiz belongs to, first", () => {
    const row = quizRow(
      quiz({
        quizId: 5,
        score: 15,
        maxScore: 20,
        sessionTitle: "Week 1",
        sessionDate: "2099-03-01T18:00:00.000Z",
      }),
    );
    expect(row.subtitle).toBe("Week 1 · Mar 1, 2099");
    expect(quizRow(quiz({ quizId: 6, sessionTitle: "Week 2" })).subtitle).toBe("Week 2");
  });

  it("notes reach the subtitle of an unscored row too", () => {
    expect(quizRow(quiz({ quizId: 5, kind: "PAPER", notes: "Bring a pen" })).subtitle).toBe("Bring a pen");
  });
});

describe("isOpenQuiz (P2-4)", () => {
  it("is an unscored ONLINE quiz not yet handed in", () => {
    expect(isOpenQuiz(quiz({ quizId: 1 }))).toBe(true);
    expect(isOpenQuiz(quiz({ quizId: 1, attemptStatus: "IN_PROGRESS" }))).toBe(true);
  });

  it("is false for paper, for scored and for handed-in quizzes", () => {
    expect(isOpenQuiz(quiz({ quizId: 1, kind: "PAPER" }))).toBe(false);
    expect(isOpenQuiz(quiz({ quizId: 1, score: 8 }))).toBe(false);
    expect(isOpenQuiz(quiz({ quizId: 1, attemptStatus: "SUBMITTED" }))).toBe(false);
  });
});

describe("todayWork (P2-5)", () => {
  const due = (id: number, dueOrgDay: string | null) =>
    assignment({ id, dueOrgDay, dueAt: dueOrgDay ? `${dueOrgDay}T10:00:00.000Z` : null });

  it("orders overdue, returned, due within 7 days, then open quizzes", () => {
    const rows = todayWork(
      [
        due(1, "2099-03-02"),
        assignment({ id: 2, status: "RETURNED", dueOrgDay: "2099-06-01" }),
        assignment({ id: 3, isOverdue: true, dueOrgDay: "2099-02-20" }),
      ],
      [quiz({ quizId: 9 })],
      TODAY,
    );
    expect(rows.map((r) => r.key)).toEqual(["assignment-3", "assignment-2", "assignment-1", "quiz-ONLINE-9"]);
  });

  it("files a returned row past its due date under returned, matching its chip", () => {
    const rows = todayWork(
      [
        assignment({ id: 1, status: "RETURNED", isOverdue: true, dueOrgDay: "2099-02-20" }),
        assignment({ id: 2, isOverdue: true, dueOrgDay: "2099-02-25" }),
      ],
      [],
      TODAY,
    );
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it("keeps day 7, drops day 8 and undated work", () => {
    const rows = todayWork([due(1, "2099-03-08"), due(2, "2099-03-09"), due(3, null)], [], TODAY);
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it("keeps a returned row with no due date", () => {
    const rows = todayWork([assignment({ id: 1, status: "RETURNED", dueOrgDay: null, dueAt: null })], [], TODAY);
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it("keeps the server's order inside a bucket", () => {
    const rows = todayWork([due(2, "2099-03-02"), due(1, "2099-03-03")], [], TODAY);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it("leaves out quizzes that are not open", () => {
    const rows = todayWork([], [quiz({ quizId: 1, kind: "PAPER" }), quiz({ quizId: 2, score: 5 })], TODAY);
    expect(rows).toEqual([]);
  });
});

describe("workSections", () => {
  const keys = (rows: { key: string }[]) => rows.map((r) => r.key);

  it("the tab is where Today's See all goes", () => {
    expect(WORK_HREF).toBe("/work");
  });

  it("To do is todayWork's order, then later and undated assignments", () => {
    const later = assignment({ id: 1, dueOrgDay: "2099-04-01" });
    const undated = assignment({ id: 2, dueOrgDay: null, dueAt: null });
    const soon = assignment({ id: 3 });
    const returned = assignment({ id: 4, status: "RETURNED" });
    const overdue = assignment({ id: 5, isOverdue: true, status: "DRAFT" });
    const open = quiz({ quizId: 9 });
    const { todo } = workSections([later, undated, soon, returned, overdue], [open], TODAY);
    expect(keys(todo)).toEqual([
      ...keys(todayWork([later, undated, soon, returned, overdue], [open], TODAY)),
      "assignment-1",
      "assignment-2",
    ]);
    expect(keys(todo)).toEqual([
      "assignment-5",
      "assignment-4",
      "assignment-3",
      "quiz-ONLINE-9",
      "assignment-1",
      "assignment-2",
    ]);
  });

  it("Done holds handed-in assignments and every quiz that is not open", () => {
    const { todo, doneAssignments, doneQuizzes } = workSections(
      [assignment({ id: 1, status: "SUBMITTED" }), assignment({ id: 2, status: "REVIEWED" })],
      [
        quiz({ quizId: 1, score: 5 }),
        quiz({ quizId: 2, kind: "PAPER" }),
        quiz({ quizId: 3, attemptStatus: "SUBMITTED" }),
      ],
      TODAY,
    );
    expect(todo).toEqual([]);
    expect(keys(doneAssignments)).toEqual(["assignment-1", "assignment-2"]);
    expect(keys(doneQuizzes)).toEqual(["quiz-ONLINE-1", "quiz-PAPER-2", "quiz-ONLINE-3"]);
  });

  it("no row is listed twice", () => {
    const { todo, doneAssignments, doneQuizzes } = workSections(
      (["PENDING", "DRAFT", "RETURNED", "SUBMITTED", "REVIEWED"] as const).map((status, i) =>
        assignment({ id: i, status }),
      ),
      [quiz({ quizId: 1 }), quiz({ quizId: 2, score: 1 })],
      TODAY,
    );
    const all = keys([...todo, ...doneAssignments, ...doneQuizzes]);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(7);
  });

  it("counts as the old screens did: RETURNED in none of the three", () => {
    const { stats } = workSections(
      [
        assignment({ id: 1, status: "PENDING" }),
        assignment({ id: 2, status: "DRAFT" }),
        assignment({ id: 3, status: "SUBMITTED" }),
        assignment({ id: 4, status: "REVIEWED" }),
        assignment({ id: 5, status: "RETURNED" }),
      ],
      [],
      TODAY,
    );
    expect(stats).toEqual({ submitted: 2, pending: 2, reviewed: 1, quizAverage: null });
  });

  it("averages scored rows only: an unattempted or zero-point quiz does not drag it down", () => {
    const { stats } = workSections(
      [],
      [
        quiz({ quizId: 1, score: 15, maxScore: 20 }),
        quiz({ quizId: 2, score: 5, maxScore: 10 }),
        quiz({ quizId: 3 }),
        quiz({ quizId: 4, score: 0, maxScore: 0 }),
      ],
      TODAY,
    );
    // (15/20 + 5/10) / 2 = 62.5% rounds to 63%.
    expect(stats.quizAverage).toBe(63);
  });
});
