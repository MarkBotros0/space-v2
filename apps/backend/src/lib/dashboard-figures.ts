// apps/backend/src/lib/dashboard-figures.ts
import { isAssignmentOutstanding } from "../../../../packages/shared/src/index";
import type { StudentAssignmentStateRow } from "./queries/assignments";
import { MS_PER_MINUTE } from "./org-time";

/*
 * The dashboard's own arithmetic (spec 19 §7) — pure, so it is unit-tested
 * without a database. Every predicate it needs is imported from its owner;
 * nothing here re-states "outstanding", "late" or "overdue" (ruling C4).
 */

/** D13: a session is in progress from its start instant until start + duration. */
export function isSessionInProgress(startsAt: Date, durationMinutes: number, now: Date): boolean {
  const start = startsAt.getTime();
  return start <= now.getTime() && now.getTime() < start + durationMinutes * MS_PER_MINUTE;
}

export interface ProgressFigures {
  sessionsHeld: number;
  sessionsTotal: number;
  pct: number | null;
}

/** D12: sessions held over sessions scheduled. No percentage of an empty season. */
export function progressFrom(held: number, total: number): ProgressFigures {
  return {
    sessionsHeld: held,
    sessionsTotal: total,
    pct: total > 0 ? Math.round((held / total) * 100) : null,
  };
}

type StudentAssignmentSummaryRow = Omit<StudentAssignmentStateRow, "isLate">;

export interface StudentAssignmentSummaryFigures {
  outstandingCount: number;
  overdueCount: number;
  lateSubmittedCount: number;
  dueSoon: StudentAssignmentSummaryRow[];
  /** Every outstanding row, uncapped, `dueAt` asc nulls last then id. */
  open: StudentAssignmentSummaryRow[];
}

const outstanding = (r: StudentAssignmentStateRow) =>
  isAssignmentOutstanding({
    submittedAt: r.submittedAt?.toISOString() ?? null,
    partsLeft: r.partsTotal - r.partsDone,
    returned: r.returned,
  });

/**
 * The student's assignment figures over every assignment of their season (the
 * rows come from `listAssignmentStatesForStudent`).
 *
 * Outstanding is the one shared predicate (C5, D15): not submitted, parts
 * left, or an essay returned. Late is the row's `isLate`, computed by the
 * exported `isLate` in lib/queries/assignments (D16) — counted only on
 * submitted rows, so unfinished work can never be "late".
 */
export function summarizeStudentAssignments(
  rows: readonly StudentAssignmentStateRow[],
  limit: number,
): StudentAssignmentSummaryFigures {
  const dueKey = (r: StudentAssignmentStateRow) => (r.dueAt === null ? Number.POSITIVE_INFINITY : r.dueAt.getTime());
  const byDue = (a: StudentAssignmentStateRow, b: StudentAssignmentStateRow) => dueKey(a) - dueKey(b) || a.id - b.id;
  const toWire = ({ isLate: _isLate, ...wire }: StudentAssignmentStateRow) => wire;
  // P2-4: work the student still has to do, a returned essay included.
  const open = rows.filter(outstanding).sort(byDue);

  return {
    outstandingCount: open.length,
    overdueCount: open.filter((r) => r.isOverdue).length,
    lateSubmittedCount: rows.filter((r) => !outstanding(r) && r.isLate).length,
    dueSoon: open.slice(0, limit).map(toWire),
    open: open.map(toWire),
  };
}

interface QuizForRollup {
  id: number;
  kind: "PAPER" | "ONLINE";
  publishedAt: Date | null;
}

/** An ONLINE quiz nobody can take yet. PAPER quizzes have no publish step. */
export function isQuizDraft(q: QuizForRollup): boolean {
  return q.kind === "ONLINE" && q.publishedAt === null;
}

export interface QuizRollupFigures {
  total: number;
  pending: number;
  fullyGraded: number;
  drafts: number;
}

/**
 * D10. `gradedBy` is Plan 8's per-kind graded count (`countGradedByQuiz`) over
 * the caller's `visibleStudentIdsForQuiz` population; `studentCount` is that
 * population's size — the same two numbers `GET /quizzes` serves per row.
 */
export function quizRollupFrom(
  quizzes: readonly QuizForRollup[],
  gradedBy: ReadonlyMap<number, number>,
  studentCount: number,
): QuizRollupFigures {
  const live = quizzes.filter((q) => !isQuizDraft(q));
  const pending = live.filter((q) => studentCount > 0 && (gradedBy.get(q.id) ?? 0) < studentCount).length;
  return {
    total: live.length,
    pending,
    fullyGraded: live.length - pending,
    drafts: quizzes.length - live.length,
  };
}

export interface ActivityRow {
  key: string;
  kind: "attendance" | "submitted" | "reviewed";
  at: Date;
  studentUserId: number;
  studentName: string;
  subjectTitle: string;
  attendanceStatus: "PRESENT" | "ABSENT" | "LATE" | null;
  submissionPublicId: string | null;
}

/**
 * D18: one feed, newest first. v1 rendered four attendance rows then four
 * submission rows, so its "recent activity" was not in time order (R53).
 */
export function mergeActivity(rows: readonly ActivityRow[], limit: number): ActivityRow[] {
  return [...rows]
    .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, limit);
}
