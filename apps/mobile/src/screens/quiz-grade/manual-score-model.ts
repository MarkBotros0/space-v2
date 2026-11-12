/**
 * The season admin's score for one student on an ONLINE quiz (plan 4,
 * docs/rules/quiz-results.md "Manual score"): what the sheet says the app has for them, and the
 * typed score read the way people write it ("7.5" or "7,5").
 */
import type { QuizGradingAttempt, QuizGradingPage } from "@space/shared";

import { formatScore } from "../../lib/format";

type Waiting = QuizGradingPage["waiting"][number];
type ManualScoreRow = QuizGradingAttempt | Waiting;

/** Who the sheet scores, what the app has for them, and the admin's score so far. */
export type ManualScoreTarget = {
  studentUserId: number;
  name: string;
  appStatus: string;
  adminScore: QuizGradingAttempt["adminScore"];
};

const isAttempt = (row: ManualScoreRow): row is QuizGradingAttempt => "attemptId" in row;

/**
 * The app's own best graded score. `bestScore` is the score that counts, so once the admin has
 * entered one it is theirs; the latest attempt's own total is then the app's.
 */
function appScore(a: QuizGradingAttempt): number | null {
  if (a.adminScore === null) return a.bestScore ?? (a.status === "GRADED" ? a.totalScore : null);
  return a.status === "GRADED" ? a.totalScore : null;
}

/** Where the student stands in the app, shown above the score field (spec "Staff UI"). */
export function manualScoreAppStatus(row: ManualScoreRow, maxScore: number): string {
  if (!isAttempt(row)) return row.startedAt === null ? "Didn't take it" : "In progress";
  if (row.status === "IN_PROGRESS") return "In progress";
  const score = appScore(row);
  if (score !== null) return `Graded in the app: ${formatScore(score)} / ${formatScore(maxScore)}`;
  return "Waiting for marking";
}

export function manualScoreTarget(row: ManualScoreRow, maxScore: number): ManualScoreTarget {
  return {
    studentUserId: row.studentUserId,
    name: row.studentName ?? "Student",
    appStatus: manualScoreAppStatus(row, maxScore),
    adminScore: row.adminScore,
  };
}

const NUMBER = /^(\d+([.,]\d*)?|[.,]\d+)$/;

/** The typed score: 0 to the quiz's maximum, at most two decimals, a comma read as the point. */
export function parseManualScore(
  text: string,
  maxScore: number,
): { ok: true; score: number } | { ok: false; error: string } {
  const range = { ok: false as const, error: `Enter a score from 0 to ${formatScore(maxScore)}.` };
  const typed = text.trim();
  if (!NUMBER.test(typed)) return range;
  const normal = typed.replace(",", ".");
  const score = Number(normal);
  if (!Number.isFinite(score) || score > maxScore) return range;
  if ((normal.split(".")[1] ?? "").length > 2) return { ok: false, error: "Use at most two decimals." };
  return { ok: true, score };
}
