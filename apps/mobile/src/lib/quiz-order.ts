import type { QuizSummary } from "@space/shared";

/** v1 order: session date, newest first; quizzes without a session last (B3-10). */
export function bySessionDate(a: QuizSummary, b: QuizSummary): number {
  if (a.sessionDate === b.sessionDate) return b.id - a.id;
  if (a.sessionDate === null) return 1;
  if (b.sessionDate === null) return -1;
  return b.sessionDate.localeCompare(a.sessionDate);
}
