import type { QuizGradingAttempt } from "@space/shared";

import { formatDate, formatScore, unbreakable } from "../../lib/format";

/**
 * A row is the latest attempt (the one marked or reopened), but its score is the
 * best graded one (spec "Honest accidents"); "Best" says so when that isn't this attempt's own.
 * With the admin's score (plan 4) it is that score, unlabelled here: the row says "Score entered by admin".
 */
export function attemptSubtitle(a: QuizGradingAttempt, maxScore: number): string {
  const graded = a.status === "GRADED";
  const best = a.bestScore ?? (graded ? (a.totalScore ?? 0) : null);
  // The admin's score is not a "best" of anything: the row's label says whose it is.
  const own = a.adminScore !== null || (graded && best === a.totalScore);
  const score = best === null ? null : `${own ? "" : "Best "}${formatScore(best)}/${maxScore}`;
  const parts = [`Attempt ${a.attemptNumber}`, score, graded ? null : "Awaiting grading"];
  return [...parts, unbreakable(formatDate(a.submittedAt))].filter((p) => p !== null).join(" · ");
}
