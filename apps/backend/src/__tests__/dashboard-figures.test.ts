// apps/backend/src/__tests__/dashboard-figures.test.ts
import {
  isQuizDraft,
  isSessionInProgress,
  mergeActivity,
  progressFrom,
  quizRollupFrom,
  summarizeStudentAssignments,
  type ActivityRow,
} from "../lib/dashboard-figures";
import type { StudentAssignmentStateRow } from "../lib/queries/assignments";

const now = new Date("2099-03-01T18:30:00.000Z");

describe("isSessionInProgress (spec 19 D13)", () => {
  const start = new Date("2099-03-01T18:00:00.000Z");
  it("is true from the start instant up to, not including, the end", () => {
    expect(isSessionInProgress(start, 60, new Date("2099-03-01T18:00:00.000Z"))).toBe(true);
    expect(isSessionInProgress(start, 60, now)).toBe(true);
    expect(isSessionInProgress(start, 60, new Date("2099-03-01T19:00:00.000Z"))).toBe(false);
  });
  it("is false before the start", () => {
    expect(isSessionInProgress(start, 60, new Date("2099-03-01T17:59:59.000Z"))).toBe(false);
  });
});

describe("progressFrom (D12 — sessions, never weeks)", () => {
  it("rounds held over total", () => {
    expect(progressFrom(3, 4)).toEqual({ sessionsHeld: 3, sessionsTotal: 4, pct: 75 });
    expect(progressFrom(1, 3)).toEqual({ sessionsHeld: 1, sessionsTotal: 3, pct: 33 });
  });
  it("has no percentage for a season with no sessions", () => {
    expect(progressFrom(0, 0)).toEqual({ sessionsHeld: 0, sessionsTotal: 0, pct: null });
  });
});

const row = (over: Partial<StudentAssignmentStateRow>): StudentAssignmentStateRow => ({
  id: 1,
  title: "A",
  dueAt: null,
  dueOrgDay: null,
  isOverdue: false,
  isLate: false,
  status: "PENDING",
  reviewedAt: null,
  submittedAt: null,
  partsTotal: 3,
  partsDone: 0,
  returned: false,
  hasEssay: true,
  staffMarked: false,
  ...over,
});

const submitted = new Date("2099-02-20T10:00:00.000Z");

describe("summarizeStudentAssignments (C5, D15, D16, R73)", () => {
  const rows = [
    row({ id: 1, dueAt: new Date("2099-04-01T10:00:00.000Z"), dueOrgDay: "2099-04-01" }),
    row({ id: 2, isOverdue: true, dueAt: new Date("2020-01-05T10:00:00.000Z"), dueOrgDay: "2020-01-05" }),
    // Two of three parts done, not submitted.
    row({ id: 3, status: "DRAFT", partsDone: 2 }),
    // An essay came back: outstanding again, its overdue flag counts.
    row({
      id: 4,
      status: "RETURNED",
      partsDone: 2,
      returned: true,
      isOverdue: true,
      dueAt: new Date("2020-01-01T10:00:00.000Z"),
    }),
    row({ id: 5, status: "SUBMITTED", partsDone: 3, submittedAt: submitted, isLate: true }),
    row({ id: 6, status: "REVIEWED", partsDone: 3, submittedAt: submitted }),
    row({ id: 7, dueAt: new Date("2099-02-01T10:00:00.000Z"), dueOrgDay: "2099-02-01" }),
  ];

  it("counts outstanding = not submitted, parts left or returned; overdue among them; late among submitted", () => {
    const s = summarizeStudentAssignments(rows, 3);
    expect(s.outstandingCount).toBe(5);
    expect(s.overdueCount).toBe(2);
    expect(s.lateSubmittedCount).toBe(1);
  });

  it("a staff mark is complete, parts left or not", () => {
    const s = summarizeStudentAssignments([row({ id: 8, status: "REVIEWED", partsDone: 1, staffMarked: true })], 3);
    expect(s.outstandingCount).toBe(0);
    expect(s.lateSubmittedCount).toBe(0);
  });

  it("every part done but Submit not tapped is still outstanding", () => {
    const s = summarizeStudentAssignments([row({ id: 9, status: "DRAFT", partsDone: 3 })], 3);
    expect(s.outstandingCount).toBe(1);
  });

  it("open holds every outstanding row, uncapped, dueAt asc nulls last then id", () => {
    const many = [
      ...rows,
      row({ id: 8, status: "RETURNED", returned: true, dueAt: new Date("2099-01-01T10:00:00.000Z") }),
      row({ id: 9 }),
    ];
    const s = summarizeStudentAssignments(many, 3);
    // 4 (2020-01-01), 2 (2020-01-05), 8, 7, 1, then undated by id: 3, 9
    expect(s.open.map((r) => r.id)).toEqual([4, 2, 8, 7, 1, 3, 9]);
    expect(s.open.some((r) => r.status === "SUBMITTED" || r.status === "REVIEWED")).toBe(false);
    expect(s.open.every((r) => !("isLate" in r))).toBe(true);
    expect(s.outstandingCount).toBe(7);
    expect(s.dueSoon).toHaveLength(3);
  });

  it("lists outstanding rows by dueAt ascending, nulls last, overdue included, capped", () => {
    const s = summarizeStudentAssignments(rows, 3);
    expect(s.dueSoon.map((r) => r.id)).toEqual([4, 2, 7]);
    expect(summarizeStudentAssignments(rows, 10).dueSoon.map((r) => r.id)).toEqual([4, 2, 7, 1, 3]);
  });

  it("never ships isLate on a due-soon row (the wire row is the student list row)", () => {
    expect(summarizeStudentAssignments(rows, 3).dueSoon[0]).not.toHaveProperty("isLate");
  });
});

describe("quizRollupFrom (D10)", () => {
  const quizzes = [
    { id: 1, kind: "PAPER" as const, publishedAt: null },
    { id: 2, kind: "ONLINE" as const, publishedAt: new Date() },
    { id: 3, kind: "ONLINE" as const, publishedAt: null },
  ];
  it("treats only unpublished ONLINE quizzes as drafts", () => {
    expect(quizzes.map(isQuizDraft)).toEqual([false, false, true]);
  });
  it("is pending while fewer graded than students; drafts are separate", () => {
    expect(
      quizRollupFrom(
        quizzes,
        new Map([
          [1, 2],
          [2, 3],
        ]),
        3,
      ),
    ).toEqual({
      total: 2,
      pending: 1,
      fullyGraded: 1,
      drafts: 1,
    });
  });
  it("is never pending with no students in scope", () => {
    expect(quizRollupFrom(quizzes, new Map(), 0)).toEqual({ total: 2, pending: 0, fullyGraded: 2, drafts: 1 });
  });
});

describe("mergeActivity (D18)", () => {
  const a = (key: string, at: string): ActivityRow => ({
    key,
    kind: "attendance",
    at: new Date(at),
    studentUserId: 1,
    studentName: "S",
    subjectTitle: "T",
    attendanceStatus: "PRESENT",
    submissionPublicId: null,
  });
  it("is one list, newest first, ties by key, capped", () => {
    const merged = mergeActivity(
      [a("att:1", "2099-01-01"), a("rev:1", "2099-01-03"), a("sub:2", "2099-01-02"), a("sub:1", "2099-01-02")],
      3,
    );
    expect(merged.map((r) => r.key)).toEqual(["rev:1", "sub:1", "sub:2"]);
  });
});
