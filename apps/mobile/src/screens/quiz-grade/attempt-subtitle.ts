import type { QuizGradingAttempt } from "@space/shared";

import { formatDate, formatScore, unbreakable } from "../../lib/format";

/**
 * A row is the latest attempt (the one marked or reopened), but its score is the
 * best graded one (spec "Honest accidents"); "Best" says so when that isn't this attempt's own.
 * With the admin's score (plan 4) the score here is the app's (`appScore`); the row's label says the admin's.
 */
export function attemptSubtitle(a: QuizGradingAttempt, maxScore: number): string {
  const graded = a.status === "GRADED";
  // With the admin's score the row's label carries it; the attempt part is the app's own best.
  const best = a.adminScore !== null ? a.appScore : (a.bestScore ?? (graded ? (a.totalScore ?? 0) : null));
  const own = graded && best === a.totalScore;
  const score = best === null ? null : `${own ? "" : "Best "}${formatScore(best)}/${maxScore}`;
  const parts = [`Attempt ${a.attemptNumber}`, score, graded ? null : "Awaiting grading"];
  return [...parts, unbreakable(formatDate(a.submittedAt))].filter((p) => p !== null).join(" · ");
}

/** The row's label for the admin's score (plan 4), with the score itself. */
export function adminScoreLabel(score: number, maxScore: number): string {
  return `Score entered by admin: ${formatScore(score)}/${maxScore}`;
}
