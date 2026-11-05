/**
 * The student's work as rows: assignments and quizzes in one shape, for Today
 * and the Work list. Status always through the chip vocabulary; deadlines only
 * from server fields (`isOverdue`, `dueOrgDay`, `todayOrgDay`), never the device clock.
 */
import type { Href } from "expo-router";
import type { DashboardDueItem, StudentAssignmentListItem, StudentQuizResult } from "@space/shared";

import { dueChip, statusChip, type ChipSpec } from "../../design/ui/status-chip";
import { daysBetween } from "../../lib/calendar-grid";
import { formatDate } from "../../lib/format";

/** Where "See all" and the Assignments tile go. */
export const WORK_HREF = "/assignments" as const;

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

export function assignmentRow(a: StudentAssignmentListItem, todayOrgDay: string): WorkRow {
  const row = {
    key: `assignment-${a.id}`,
    kind: "assignment" as const,
    id: a.id,
    title: a.title,
    href: { pathname: "/assignment/[id]" as const, params: { id: String(a.id) } },
  };
  switch (a.status) {
    case "RETURNED":
      return { ...row, chip: statusChip("submission", "RETURNED"), subtitle: "Returned with comments" };
    case "SUBMITTED":
    case "REVIEWED":
      return { ...row, chip: statusChip("submission", a.status) };
    case "DRAFT":
      return { ...row, chip: dueChip({ ...a, todayOrgDay }), subtitle: "Draft saved" };
    case "PENDING":
      return { ...row, chip: dueChip({ ...a, todayOrgDay }) };
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
  const pct = scored && q.maxScore > 0 ? Math.round(((q.score as number) / q.maxScore) * 100) : 0;
  const parts = [
    scored ? `${pct}%` : null,
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
