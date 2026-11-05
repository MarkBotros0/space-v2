/**
 * The student's work as rows: assignments and quizzes in one shape, for Today
 * and the Work list. Status always through the chip vocabulary; deadlines only
 * from server fields (`isOverdue`, `dueOrgDay`, `todayOrgDay`), never the device clock.
 */
import type { Href } from "expo-router";
import type { DashboardDueItem, StudentAssignmentListItem, StudentQuizResult } from "@space/shared";

import { dueChip, statusChip, type ChipSpec } from "../../design/ui/status-chip";
import { daysBetween } from "../../lib/calendar-grid";
import { formatDate, formatDayKey } from "../../lib/format";

/** Where "See all" and the Assignments tile go. */
export const WORK_HREF = "/work" as const;

/** P2-5: Today lists work due within this many org days; the rest is behind "See all". */
const TODAY_WINDOW_DAYS = 7;

export type WorkRow = {
  key: string;
  kind: "assignment" | "quiz";
  id: number;
  title: string;
  subtitle?: string;
  chip?: ChipSpec;
  score?: string;
  /** Null for a row that opens nothing (a paper quiz). */
  href: Href | null;
};

/** A deadline chip that names the date itself ("Due Nov 14"), not "Overdue", "Due Fri" or "Due in 2 days". */
const DATE_CHIP = /^Due [A-Z][a-z]{2} \d{1,2}$/;

/**
 * The note, then the date it was due: a status chip or a relative deadline chip
 * ("Overdue", "Due Fri") does not say when, so the date follows. A chip that
 * already names the date does not get it repeated, except across a year
 * boundary, since the chip has no year. From the org day, so it is zone-safe.
 */
function assignmentSubtitle(
  note: string | null,
  dueOrgDay: string | null,
  chip: ChipSpec,
  todayOrgDay: string,
): { subtitle?: string } {
  const chipHasDate = DATE_CHIP.test(chip.label);
  const sameYear = dueOrgDay !== null && dueOrgDay.slice(0, 4) === todayOrgDay.slice(0, 4);
  const due =
    dueOrgDay !== null && !(chipHasDate && sameYear) ? `Due ${formatDayKey(dueOrgDay)}` : null;
  const subtitle = [note, due].filter((part) => part !== null).join(" · ");
  return subtitle ? { subtitle } : {};
}

export function assignmentRow(a: StudentAssignmentListItem, todayOrgDay: string): WorkRow {
  const row = {
    key: `assignment-${a.id}`,
    kind: "assignment" as const,
    id: a.id,
    title: a.title,
    href: { pathname: "/assignment/[id]" as const, params: { id: String(a.id) } },
  };
  switch (a.status) {
    case "RETURNED": {
      const chip = statusChip("submission", "RETURNED");
      return {
        ...row,
        chip,
        ...assignmentSubtitle("Returned with comments", a.dueOrgDay, chip, todayOrgDay),
      };
    }
    case "SUBMITTED":
    case "REVIEWED": {
      const chip = statusChip("submission", a.status);
      return { ...row, chip, ...assignmentSubtitle(null, a.dueOrgDay, chip, todayOrgDay) };
    }
    case "DRAFT": {
      const chip = dueChip({ ...a, todayOrgDay });
      return { ...row, chip, ...assignmentSubtitle("Draft saved", a.dueOrgDay, chip, todayOrgDay) };
    }
    case "PENDING": {
      const chip = dueChip({ ...a, todayOrgDay });
      return { ...row, chip, ...assignmentSubtitle(null, a.dueOrgDay, chip, todayOrgDay) };
    }
  }
}

function quizChip(q: StudentQuizResult): ChipSpec | undefined {
  if (q.score !== null) return undefined;
  if (q.kind === "PAPER") return { tone: "neutral", label: "Pending" };
  if (q.attemptStatus === null) return { tone: "info", label: "Take quiz" };
  if (q.attemptStatus === "IN_PROGRESS") return { tone: "warn", label: "Resume" };
  return { tone: "neutral", label: "Awaiting grading" };
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
    scored && q.gradedAt ? `Graded ${formatDate(q.gradedAt)}` : null,
    q.notes,
  ].filter((part) => part !== null && part !== "");
  const chip = quizChip(q);
  return {
    // A paper and an online quiz can share an id: they are different tables.
    key: `quiz-${q.kind}-${q.quizId}`,
    kind: "quiz",
    id: q.quizId,
    title: q.title,
    ...(parts.length > 0 ? { subtitle: parts.join(" · ") } : {}),
    ...(chip ? { chip } : {}),
    ...(scored ? { score: `${q.score}/${q.maxScore}` } : {}),
    // v1: a paper quiz is a plain row, not a link.
    href: q.kind === "ONLINE" ? { pathname: "/quiz/[id]", params: { id: String(q.quizId) } } : null,
  };
}

/** P2-4: an ONLINE quiz with no score, not started or still in progress. */
export function isOpenQuiz(q: StudentQuizResult): boolean {
  return (
    q.kind === "ONLINE" &&
    q.score === null &&
    (q.attemptStatus === null || q.attemptStatus === "IN_PROGRESS")
  );
}

/**
 * P2-5: overdue, then returned, then due within 7 org days, then open quizzes;
 * inside a group the server's order holds. `isOverdue` is only about the
 * deadline, so a returned row past it is filed by its status, as its chip says.
 */
export function todayWork(
  open: DashboardDueItem[],
  quizzes: StudentQuizResult[],
  todayOrgDay: string,
): WorkRow[] {
  const returned = open.filter((a) => a.status === "RETURNED");
  const rest = open.filter((a) => a.status !== "RETURNED");
  const overdue = rest.filter((a) => a.isOverdue);
  const dueSoon = rest.filter(
    (a) =>
      !a.isOverdue &&
      a.dueOrgDay !== null &&
      daysBetween(todayOrgDay, a.dueOrgDay) <= TODAY_WINDOW_DAYS,
  );
  return [
    ...[...overdue, ...returned, ...dueSoon].map((a) => assignmentRow(a, todayOrgDay)),
    ...quizzes.filter(isOpenQuiz).map(quizRow),
  ];
}

export type WorkSections = {
  todo: WorkRow[];
  doneAssignments: WorkRow[];
  doneQuizzes: WorkRow[];
  stats: { submitted: number; pending: number; reviewed: number; quizAverage: number | null };
};

/** Scored rows only, so an unattempted quiz cannot drag the average down. */
function quizAverage(quizzes: StudentQuizResult[]): number | null {
  const scored = quizzes.filter((q) => q.score !== null && q.maxScore > 0);
  if (scored.length === 0) return null;
  const total = scored.reduce((sum, q) => sum + (q.score as number) / q.maxScore, 0);
  return Math.round((total / scored.length) * 100);
}

/**
 * The Work tab. To do opens with Today's list (P2-5), then the open assignments
 * Today leaves behind "See all", later and undated, in the server's order (due
 * date, undated last). RETURNED counts in none of the three figures, as in v1.
 */
export function workSections(
  assignments: StudentAssignmentListItem[],
  quizzes: StudentQuizResult[],
  todayOrgDay: string,
): WorkSections {
  const open = assignments.filter(
    (a) => a.status === "PENDING" || a.status === "DRAFT" || a.status === "RETURNED",
  );
  const handedIn = assignments.filter((a) => a.status === "SUBMITTED" || a.status === "REVIEWED");
  const first = todayWork(open, quizzes, todayOrgDay);
  const listed = new Set(first.map((row) => row.key));
  return {
    todo: [
      ...first,
      ...open.map((a) => assignmentRow(a, todayOrgDay)).filter((row) => !listed.has(row.key)),
    ],
    doneAssignments: handedIn.map((a) => assignmentRow(a, todayOrgDay)),
    doneQuizzes: quizzes.filter((q) => !isOpenQuiz(q)).map(quizRow),
    stats: {
      submitted: handedIn.length,
      pending: assignments.filter((a) => a.status === "PENDING" || a.status === "DRAFT").length,
      reviewed: assignments.filter((a) => a.status === "REVIEWED").length,
      quizAverage: quizAverage(quizzes),
    },
  };
}
