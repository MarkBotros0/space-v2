import type { StudentQuizDetail } from "@space/shared";

/** A question's card on the student quiz pages. */
export const QCARD = "rounded-group bg-surface p-4";

/** `Screen`'s title and subtitle for a student quiz page: the quiz and its session. */
export function quizTitleProps(detail: StudentQuizDetail): { title: string; subtitle?: string } {
  return { title: detail.title, subtitle: detail.sessionTitle ?? undefined };
}
