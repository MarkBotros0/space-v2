/**
 * The student's work as rows: assignments and quizzes in one shape, for Today
 * and the Work list. Status always through the chip vocabulary; deadlines only
 * from server fields (`isOverdue`, `dueOrgDay`, `todayOrgDay`), never the device clock.
 */
import type { Href } from "expo-router";
import type { DashboardDueItem, StudentAssignmentListItem, StudentQuizResult } from "@space/shared";

import { dueChip, statusChip, type ChipSpec } from "../../design/ui/status-chip";
import { daysBetween } from "../../lib/calendar-grid";
import { formatDate, formatDayKey, formatScore, unbreakable } from "../../lib/format";
import { plural } from "../../lib/plural";

/** Where "See all" and the Assignments tile go. */
export const WORK_HREF = "/work" as const;

/** P2-5: Today lists work due within this many org days; the rest is behind "See all". */
const TODAY_WINDOW_DAYS = 7;

export type WorkRow = {
  key: string;
  kind: "assignment" | "quiz";
  id: number;
  title: string;
  /** One line of its own above the subtitle: an assignment's parts or its returned note. */
  detail?: string;
  subtitle?: string;
  chip?: ChipSpec;
  score?: string;
  /** Null for a row that opens nothing (a paper quiz). */
  href: Href | null;
};

const DATE_CHIP = /^Due [A-Z][a-z]{2} \d{1,2}$/;

/** A deadline chip that names the date itself ("Due Nov 14"), not "Overdue", "Due Fri" or "Due in 2 days". */
function chipNamesDate(chip: ChipSpec): boolean {
  return DATE_CHIP.test(chip.label);
}

/**
 * The note on its own line (`detail`), then the date it was due (`subtitle`): two lines,
 * never one dotted line, which wraps apart at 1.3. A status chip or a relative deadline
 * chip ("Overdue", "Due Fri") does not say when, so the date follows. A chip that
 * already names the date does not get it repeated, except across a year boundary,
 * since the chip has no year. From the org day, so it is zone-safe.
 */
function assignmentLines(
  note: string | null,
  dueOrgDay: string | null,
  chip: ChipSpec,
  todayOrgDay: string,
): { detail?: string; subtitle?: string } {
  const chipHasDate = chipNamesDate(chip);
  const sameYear = dueOrgDay !== null && dueOrgDay.slice(0, 4) === todayOrgDay.slice(0, 4);
  const due = dueOrgDay !== null && !(chipHasDate && sameYear) ? `Due ${formatDayKey(dueOrgDay)}` : null;
  return { ...(note !== null ? { detail: note } : {}), ...(due !== null ? { subtitle: due } : {}) };
}

/**
 * How far through its parts an open assignment is, in words: "3 parts" before any
 * is done, then "2 of 3 done", then, once every part is done, that Submit is what
 * is left (multi-part spec, "My work").
 */
function partsNote(a: StudentAssignmentListItem): string | null {
  if (a.partsTotal === 0) return null;
  if (a.partsDone === 0) return plural(a.partsTotal, "part");
  if (a.partsDone >= a.partsTotal) return "Ready to submit";
  return `${a.partsDone} of ${a.partsTotal} done`;
}

export function assignmentRow(a: StudentAssignmentListItem, todayOrgDay: string): WorkRow {
  const row = {
    key: `assignment-${a.id}`,
    kind: "assignment" as const,
    id: a.id,
    title: a.title,
    href: { pathname: "/assignment/[id]" as const, params: { id: String(a.id) } },
  };
  // Any returned essay makes the whole row "Returned — needs changes", whatever else is done.
  if (a.returned || a.status === "RETURNED") {
    const chip = statusChip("submission", "RETURNED");
    return { ...row, chip, ...assignmentLines("Returned — needs changes", a.dueOrgDay, chip, todayOrgDay) };
  }
  switch (a.status) {
    case "SUBMITTED":
    case "REVIEWED": {
      const chip = statusChip("submission", a.status);
      return { ...row, chip, ...assignmentLines(null, a.dueOrgDay, chip, todayOrgDay) };
    }
    default: {
      // PENDING or DRAFT: still to do.
      const chip = dueChip({ ...a, todayOrgDay });
      return { ...row, chip, ...assignmentLines(partsNote(a), a.dueOrgDay, chip, todayOrgDay) };
    }
  }
}

function quizChip(q: StudentQuizResult): ChipSpec | undefined {
  if (q.score !== null) return undefined;
  if (q.kind === "PAPER") return { tone: "neutral", label: "Pending" };
  if (q.attemptStatus === null) return { tone: "info", label: "Take quiz" };
  if (q.attemptStatus === "IN_PROGRESS") return { tone: "warn", label: "Resume" };
  return { tone: "neutral", label: "Awaiting marking" };
}

export function quizRow(q: StudentQuizResult): WorkRow {
  const scored = q.score !== null;
  const session = q.sessionTitle
    ? q.sessionDate
      ? `${q.sessionTitle} · ${formatDate(q.sessionDate)}`
      : q.sessionTitle
    : null;
  const parts = [
    session,
    scored && q.gradedAt ? unbreakable(`Graded ${formatDate(q.gradedAt)}`) : null,
    q.notes ?? q.adminScore?.notes ?? null,
  ].filter((part) => part !== null && part !== "");
  const chip = quizChip(q);
  return {
    // A paper and an online quiz can share an id: they are different tables.
    key: `quiz-${q.kind}-${q.quizId}`,
    kind: "quiz",
    id: q.quizId,
    title: q.title,
    // The admin's score (plan 4) says whose it is, on its own line.
    ...(q.adminScore ? { detail: "Score entered by your admin" } : {}),
    ...(parts.length > 0 ? { subtitle: parts.join(" · ") } : {}),
    ...(chip ? { chip } : {}),
    ...(scored ? { score: `${formatScore(q.score!)} / ${formatScore(q.maxScore)}` } : {}),
    // v1: a paper quiz is a plain row, not a link.
    href: q.kind === "ONLINE" ? { pathname: "/quiz/[id]", params: { id: String(q.quizId) } } : null,
  };
}

/** P2-4: an ONLINE quiz with no score, not started or still in progress. */
export function isOpenQuiz(q: StudentQuizResult): boolean {
  return q.kind === "ONLINE" && q.score === null && (q.attemptStatus === null || q.attemptStatus === "IN_PROGRESS");
}

/**
 * P2-5: overdue, then returned, then due within 7 org days, then open quizzes;
 * inside a group the server's order holds. `isOverdue` is only about the
 * deadline, so a returned row past it is filed by its status, as its chip says.
 */
export function todayWork(open: DashboardDueItem[], quizzes: StudentQuizResult[], todayOrgDay: string): WorkRow[] {
  const returned = open.filter((a) => a.returned || a.status === "RETURNED");
  const rest = open.filter((a) => !(a.returned || a.status === "RETURNED"));
  const overdue = rest.filter((a) => a.isOverdue);
  const dueSoon = rest.filter(
    (a) => !a.isOverdue && a.dueOrgDay !== null && daysBetween(todayOrgDay, a.dueOrgDay) <= TODAY_WINDOW_DAYS,
  );
  return [
    ...[...overdue, ...returned, ...dueSoon].map((a) => assignmentRow(a, todayOrgDay)),
    ...quizzes.filter(isOpenQuiz).map(quizRow),
  ];
}

/** A labelled group of rows; an empty group is not shown. */
type WorkGroup = { key: string; header: string; rows: WorkRow[] };

/**
 * The To do tab, grouped so a student reads it top to bottom as "what first"
 * (owner, 2026-11-06): overdue, returned for changes, due this week, later,
 * then quizzes to take. Same filing rules as Today (P2-5).
 */
export function todoGroups(
  assignments: StudentAssignmentListItem[],
  quizzes: StudentQuizResult[],
  todayOrgDay: string,
): WorkGroup[] {
  const isReturned = (a: StudentAssignmentListItem) => a.returned || a.status === "RETURNED";
  const open = assignments.filter((a) => !isReturned(a) && (a.status === "PENDING" || a.status === "DRAFT"));
  const returned = assignments.filter(isReturned);
  const overdue = open.filter((a) => a.isOverdue);
  const thisWeek = open.filter(
    (a) => !a.isOverdue && a.dueOrgDay !== null && daysBetween(todayOrgDay, a.dueOrgDay) <= TODAY_WINDOW_DAYS,
  );
  const shown = new Set([...overdue, ...thisWeek].map((a) => a.id));
  const later = open.filter((a) => !shown.has(a.id));
  const row = (a: StudentAssignmentListItem) => assignmentRow(a, todayOrgDay);
  return [
    { key: "overdue", header: "Overdue", rows: overdue.map(row) },
    { key: "returned", header: "Returned — needs changes", rows: returned.map(row) },
    { key: "week", header: "Due this week", rows: thisWeek.map(row) },
    { key: "later", header: "Later", rows: later.map(row) },
    { key: "quizzes", header: "Quizzes to take", rows: quizzes.filter(isOpenQuiz).map(quizRow) },
  ].filter((g) => g.rows.length > 0);
}

/**
 * A handed-in assignment on the Submitted tab: the chip says in words where
 * the grading stands — never colour alone.
 */
function submittedAssignmentRow(a: StudentAssignmentListItem): WorkRow {
  const reviewed = a.status === "REVIEWED";
  const base = {
    key: `assignment-${a.id}`,
    kind: "assignment" as const,
    id: a.id,
    title: a.title,
    href: { pathname: "/assignment/[id]" as const, params: { id: String(a.id) } },
  };
  // Videos and a forum post are never reviewed: with no essay, a submitted assignment is done.
  if (!a.hasEssay) {
    return {
      ...base,
      ...(a.submittedAt ? { subtitle: unbreakable(`Submitted ${formatDate(a.submittedAt)}`) } : {}),
      chip: { tone: "ok", label: "Done" },
    };
  }
  return {
    ...base,
    subtitle: reviewed
      ? a.reviewedAt
        ? unbreakable(`Reviewed ${formatDate(a.reviewedAt)}`) + " · Open to read the feedback"
        : "Open to read the feedback"
      : "Your leader hasn't reviewed it yet",
    chip: reviewed ? { tone: "ok", label: "Reviewed" } : { tone: "info", label: "Waiting for review" },
  };
}

/** A taken or paper quiz on the Submitted tab: its score, or that it isn't out yet. */
function submittedQuizRow(q: StudentQuizResult): WorkRow {
  const base = quizRow(q);
  if (q.score !== null) return base;
  // No graded attempt yet: waiting for marking (the answers' release is a separate step).
  return { ...base, chip: { tone: "neutral", label: "Awaiting marking" } };
}

type SubmittedSections = { assignments: WorkRow[]; quizzes: WorkRow[] };

/** Newest hand-in first; an older backend sends no `submittedAt`, so the review date stands in. */
function handedInAt(a: StudentAssignmentListItem): string {
  return a.submittedAt ?? a.reviewedAt ?? "";
}

/** Newest first by the session it belonged to, then by when it was graded. */
function quizRecency(q: StudentQuizResult): string {
  return q.sessionDate ?? q.gradedAt ?? "";
}

function handedIn(assignments: StudentAssignmentListItem[]): StudentAssignmentListItem[] {
  return assignments
    .filter((a) => !a.returned && (a.status === "SUBMITTED" || a.status === "REVIEWED"))
    .sort((a, b) => handedInAt(b).localeCompare(handedInAt(a)));
}

function taken(quizzes: StudentQuizResult[]): StudentQuizResult[] {
  return quizzes.filter((q) => !isOpenQuiz(q)).sort((a, b) => quizRecency(b).localeCompare(quizRecency(a)));
}

/**
 * What the student handed in, newest first (owner, 2026-11-07: My work shows the
 * history under what is still to do). The chip says where the grading stands.
 */
export function submittedSections(
  assignments: StudentAssignmentListItem[],
  quizzes: StudentQuizResult[],
): SubmittedSections {
  return {
    assignments: handedIn(assignments).map(submittedAssignmentRow),
    quizzes: taken(quizzes).map(submittedQuizRow),
  };
}

/** The season page's preview: the last assignment handed in and the last quiz taken. */
export function latestSubmitted(
  assignments: StudentAssignmentListItem[],
  quizzes: StudentQuizResult[],
): { assignment: WorkRow | null; quiz: WorkRow | null } {
  const a = handedIn(assignments)[0];
  const q = taken(quizzes)[0];
  return {
    assignment: a ? submittedAssignmentRow(a) : null,
    quiz: q ? submittedQuizRow(q) : null,
  };
}
