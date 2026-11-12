import type { DashboardDueItem, StudentQuizResult } from "@space/shared";

import {
  assignmentRow,
  isOpenQuiz,
  quizRow,
  submittedSections,
  todayWork,
  todoGroups,
} from "../screens/work/work-model";

const TODAY = "2099-03-01";

const assignment = (over: Partial<DashboardDueItem> & { id: number }): DashboardDueItem => ({
  title: `Assignment ${over.id}`,
  dueAt: "2099-03-03T10:00:00.000Z",
  dueOrgDay: "2099-03-03",
  isOverdue: false,
  status: "PENDING",
  reviewedAt: null,
  submittedAt: null,
  partsTotal: 3,
  partsDone: 0,
  returned: false,
  hasEssay: true,
  ...over,
});

const quiz = (over: Partial<StudentQuizResult> & { quizId: number }): StudentQuizResult => ({
  title: `Quiz ${over.quizId}`,
  kind: "ONLINE",
  maxScore: 10,
  score: null,
  notes: null,
  gradedAt: null,
  sessionTitle: null,
  sessionDate: null,
  attemptStatus: null,
  answersReleased: true,
  adminScore: null,
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

  it("never joins the parts note and the due date on one line: they wrap apart at 1.3", () => {
    const row = assignmentRow(assignment({ id: 1, status: "DRAFT", partsDone: 2 }), TODAY);
    expect(`${row.detail} ${row.subtitle}`).not.toContain(" · ");
  });

  it("an open row counts its parts instead of a single status", () => {
    const row = assignmentRow(assignment({ id: 1, status: "DRAFT", partsDone: 2 }), TODAY);
    expect(row.chip?.label).toBe("Due in 2 days");
    expect(row.detail).toBe("2 of 3 done");
    expect(row.subtitle).toBe("Due Mar 3, 2099");
    expect(assignmentRow(assignment({ id: 2 }), TODAY).detail).toBe("3 parts");
    expect(assignmentRow(assignment({ id: 2 }), TODAY).subtitle).toBe("Due Mar 3, 2099");
    expect(assignmentRow(assignment({ id: 3, partsTotal: 1 }), TODAY).detail).toBe("1 part");
    expect(assignmentRow(assignment({ id: 3, partsTotal: 1 }), TODAY).subtitle).toBe("Due Mar 3, 2099");
  });

  it("every part done but not submitted says Submit is what is left", () => {
    const row = assignmentRow(assignment({ id: 1, status: "DRAFT", partsDone: 3 }), TODAY);
    expect(row.detail).toBe("Ready to submit");
    expect(row.subtitle).toBe("Due Mar 3, 2099");
  });

  it("a returned row says so, even past its due date", () => {
    const row = assignmentRow(assignment({ id: 1, status: "RETURNED", returned: true, isOverdue: true }), TODAY);
    expect(row.chip).toEqual({ tone: "warn", label: "Returned" });
    expect(row.detail).toBe("Returned — needs changes");
    expect(row.subtitle).toBe("Due Mar 3, 2099");
  });

  it("any returned essay makes the row returned, however many parts are done", () => {
    const row = assignmentRow(assignment({ id: 1, status: "DRAFT", returned: true, partsDone: 2 }), TODAY);
    expect(row.chip?.label).toBe("Returned");
    expect(row.detail).toBe("Returned — needs changes");
    expect(row.subtitle).toBe("Due Mar 3, 2099");
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
    expect(row.detail).toBe("3 parts");
    expect(row.subtitle).toBe("Due Feb 20, 2099");
  });

  it("a chip that already names the date does not repeat it in the subtitle", () => {
    const row = assignmentRow(assignment({ id: 1, dueOrgDay: "2099-03-20", dueAt: "2099-03-20T10:00:00.000Z" }), TODAY);
    expect(row.chip?.label).toBe("Due Mar 20");
    expect(row.detail).toBe("3 parts");
    expect(row.subtitle).toBeUndefined();
    const draft = assignmentRow(
      assignment({ id: 2, status: "DRAFT", dueOrgDay: "2099-03-20", dueAt: "2099-03-20T10:00:00.000Z" }),
      TODAY,
    );
    expect(draft.detail).toBe("3 parts");
    expect(draft.subtitle).toBeUndefined();
  });

  it("a date chip across a year boundary keeps the year in the subtitle", () => {
    const row = assignmentRow(assignment({ id: 1, dueOrgDay: "2100-01-20", dueAt: "2100-01-20T10:00:00.000Z" }), TODAY);
    expect(row.chip?.label).toBe("Due Jan 20");
    expect(row.detail).toBe("3 parts");
    expect(row.subtitle).toBe("Due Jan 20, 2100");
  });

  it("a weekday chip is relative wording, so the date stays", () => {
    const row = assignmentRow(assignment({ id: 1, dueOrgDay: "2099-03-06", dueAt: "2099-03-06T10:00:00.000Z" }), TODAY);
    expect(row.chip?.label).toBe("Due Friday");
    expect(row.detail).toBe("3 parts");
    expect(row.subtitle).toBe("Due Mar 6, 2099");
  });

  it("the date comes from the org day, never dueAt: the two can name different days", () => {
    const row = assignmentRow(
      assignment({ id: 1, isOverdue: true, dueOrgDay: "2099-02-01", dueAt: "2099-01-31T22:30:00.000Z" }),
      TODAY,
    );
    expect(row.detail).toBe("3 parts");
    expect(row.subtitle).toBe("Due Feb 1, 2099");
  });

  it.each([
    ["PENDING", "3 parts"],
    ["SUBMITTED", undefined],
    ["REVIEWED", undefined],
    ["DRAFT", "3 parts"],
    ["RETURNED", "Returned — needs changes"],
  ] as const)("an undated %s row names no date", (status, detail) => {
    const returned = status === "RETURNED";
    const row = assignmentRow(assignment({ id: 1, status, returned, dueOrgDay: null, dueAt: null }), TODAY);
    expect(row.detail).toBe(detail);
    expect(row.subtitle).toBeUndefined();
  });
});

describe("quizRow", () => {
  it("the admin's score: the score, whose it is on its own line, and the note", () => {
    const row = quizRow(
      quiz({
        quizId: 6,
        score: 7.5,
        gradedAt: "2099-03-02T10:00:00.000Z",
        adminScore: { score: 7.5, notes: "On paper." },
      }),
    );
    expect(row.score).toBe("7.5 / 10");
    expect(row.detail).toBe("Score entered by your admin");
    expect(row.subtitle).toContain("On paper.");
    expect(row.chip).toBeUndefined();
  });

  it("never started: Take quiz, linking to the quiz", () => {
    const row = quizRow(quiz({ quizId: 5 }));
    expect(row).toMatchObject({
      key: "quiz-ONLINE-5",
      kind: "quiz",
      id: 5,
      chip: { tone: "info", label: "Take quiz" },
    });
    expect(row.href).toEqual({ pathname: "/quiz/[id]", params: { id: "5" } });
  });

  it("in progress: Resume", () => {
    expect(quizRow(quiz({ quizId: 5, attemptStatus: "IN_PROGRESS" })).chip).toEqual({ tone: "warn", label: "Resume" });
  });

  it("submitted without a score: Awaiting marking", () => {
    expect(quizRow(quiz({ quizId: 5, attemptStatus: "SUBMITTED" })).chip).toEqual({
      tone: "neutral",
      label: "Awaiting marking",
    });
  });

  it("a score shows once graded, two decimals at most, even with a retake in progress", () => {
    const row = quizRow(quiz({ quizId: 6, score: 7.5, attemptStatus: "IN_PROGRESS" }));
    expect(row.score).toBe("7.5 / 10");
    expect(row.chip).toBeUndefined();
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
    expect(row.score).toBe("8 / 10");
    expect(row.chip).toBeUndefined();
    expect(row.subtitle).toBe("Graded\u00A0Mar\u00A02,\u00A02099 · Nice");
  });

  it("a scored paper quiz stays a plain row; a zero-point quiz does not divide by zero", () => {
    const row = quizRow(quiz({ quizId: 5, kind: "PAPER", score: 0, maxScore: 0 }));
    expect(row.href).toBeNull();
    expect(row.score).toBe("0 / 0");
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

describe("todoGroups and submittedSections (multi-part)", () => {
  it("files any assignment with a returned essay under Returned — needs changes", () => {
    const groups = todoGroups([assignment({ id: 1, status: "DRAFT", returned: true })], [], TODAY);
    expect(groups.map((g) => [g.header, g.rows.map((r) => r.id)])).toEqual([["Returned — needs changes", [1]]]);
  });

  it("a submitted assignment with no essay is Done, never waiting for review", () => {
    const { assignments } = submittedSections(
      [
        assignment({ id: 1, status: "SUBMITTED", hasEssay: false, submittedAt: "2099-02-27T10:00:00.000Z" }),
        assignment({ id: 2, status: "SUBMITTED", submittedAt: "2099-02-26T10:00:00.000Z" }),
      ],
      [],
    );
    expect(assignments.map((r) => [r.id, r.chip?.label, r.subtitle])).toEqual([
      [1, "Done", "Submitted\u00A0Feb\u00A027,\u00A02099"],
      [2, "Waiting for review", "Your leader hasn't reviewed it yet"],
    ]);
  });
});
