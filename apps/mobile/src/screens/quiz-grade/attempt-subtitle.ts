import type { QuizGradingAttempt } from "@space/shared";

import { formatDate, formatScore, unbreakable } from "../../lib/format";

/**
 * A row is the latest attempt (the one marked or reopened), but its score is the
 * best graded one (spec "Honest accidents"); "Best" says so when that isn't this attempt's own.
 */
export function attemptSubtitle(a: QuizGradingAttempt, maxScore: number): string {
  const graded = a.status === "GRADED";
  const best = a.bestScore ?? (graded ? (a.totalScore ?? 0) : null);
  const own = graded && best === a.totalScore;
  const score = best === null ? null : `${own ? "" : "Best "}${formatScore(best)}/${maxScore}`;
  const parts = [`Attempt ${a.attemptNumber}`, score, graded ? null : "Awaiting grading"];
  return [...parts, unbreakable(formatDate(a.submittedAt))].filter((p) => p !== null).join(" · ");
}
