import { bestEffort } from "../../lib/best-effort";
import { createNotificationsBulk } from "../../lib/notifications";

/**
 * v1's exact link for every QUIZ_GRADED row — `quiz-actions.ts:167,483,554`
 * all write the bare list path. Ruling X1: every plan writes v1's link format,
 * because v1 renders these same rows from the shared database today and a
 * v2-only path would be a dead link in v1. Plan 13's link parser maps this
 * shape to the mobile `/quizzes` tab; any remap is Plan 18's cutover backfill.
 * Do not "improve" it to a per-quiz path here.
 */
const QUIZ_GRADED_LINK = "/student/quizzes";

/**
 * Every QUIZ_GRADED notification this domain sends (auto-grade, essay grade,
 * paper grades, retake). Best-effort and called after the write has committed
 * (spec D6): a mail or notification failure must not report the grade as failed.
 */
export async function notifyQuizGraded(
  studentUserIds: number[],
  title: string,
  body: string,
): Promise<void> {
  await bestEffort("notify:QUIZ_GRADED", () =>
    createNotificationsBulk(studentUserIds, {
      type: "QUIZ_GRADED",
      title,
      body,
      link: QUIZ_GRADED_LINK,
    }),
  );
}
