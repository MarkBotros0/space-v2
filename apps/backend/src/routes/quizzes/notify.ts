import { db } from "../../db/client";
import { bestEffort } from "../../lib/best-effort";
import { createNotificationsBulk } from "../../lib/notifications";

/**
 * v1's exact link for every QUIZ_GRADED row — `quiz-actions.ts:167,483,554`
 * all write the bare list path. Ruling X1: every producer writes v1's link
 * format, because that is the one set of shapes lib/notification-target.ts
 * parses into a route-independent target; it maps this one to the mobile
 * `/quizzes` tab. Do not "improve" it to a per-quiz path here without adding
 * that shape to the parser.
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

/**
 * QUIZ_PUBLISHED: an ONLINE quiz just became visible to students.
 *
 * The audience is exactly who the student quiz list now shows it to. That list
 * (`listQuizResultsForStudent` in ./list.ts) returns every published ONLINE
 * quiz in the season with no group filter — quizzes carry no group targeting —
 * so the recipients are every ACTIVE enrolment in the quiz's season. Withdrawn
 * and completed students are left out: the attempt routes refuse them
 * (`hasActiveEnrollment`), so there is nothing for them to do. Deleted
 * accounts are skipped.
 *
 * Same link as QUIZ_GRADED — the list, which maps to the `quiz` target.
 * Best-effort, after the publish has committed (spec D6).
 */
export async function notifyQuizPublished(quiz: { seasonId: number; title: string }): Promise<void> {
  await bestEffort("notify:QUIZ_PUBLISHED", async () => {
    const enrolled = await db.seasonEnrollment.findMany({
      where: {
        seasonId: quiz.seasonId,
        status: "ACTIVE",
        // A draft's roster can't take the quiz yet, so there is nothing to tell them.
        season: { status: "ACTIVE" },
        studentUser: { deletedAt: null },
      },
      select: { studentUserId: true },
    });
    await createNotificationsBulk(
      enrolled.map((e) => e.studentUserId),
      { type: "QUIZ_PUBLISHED", title: `New quiz: ${quiz.title}`, link: QUIZ_GRADED_LINK },
    );
  });
}
