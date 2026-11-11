import { db } from "../../db/client";
import { liveStudentIds } from "../queries/season-participants";
import { liveUser } from "../db/live";
import { bestEffort } from "../best-effort";
import { createNotificationsBulk } from "../notifications";
import { notificationLink } from "../notification-target";

/**
 * v1's exact link for every QUIZ_GRADED row — `quiz-actions.ts:167,483,554`
 * all write the bare list path. Ruling X1: every producer writes v1's link
 * format, because that is the one set of shapes lib/notification-target.ts
 * parses into a route-independent target; it maps this one to the mobile
 * `/quizzes` tab. Do not "improve" it to a per-quiz path here without adding
 * that shape to the parser.
 */
const QUIZ_GRADED_LINK = notificationLink.studentQuizzes();

/**
 * "Your score is in": an online attempt reached GRADED, or a paper score was
 * entered or changed. Sent whether or not the answers are released. Best-effort
 * and called after the write has committed (spec D6): a mail or notification
 * failure must not report the grade as failed.
 */
export async function notifyQuizGraded(studentUserIds: number[], quizTitle: string): Promise<void> {
  await notifyQuizGradedWith(studentUserIds, `Quiz graded: ${quizTitle}`, "Your score is in.");
}

/** A retake was opened for a student: QUIZ_GRADED reused with copy that says what happened (D5). */
export async function notifyQuizRetake(studentUserId: number, quizTitle: string): Promise<void> {
  await notifyQuizGradedWith(
    [studentUserId],
    `You can retake: ${quizTitle}`,
    "Your quiz has been reopened, so you can take it again.",
  );
}

async function notifyQuizGradedWith(studentUserIds: number[], title: string, body: string): Promise<void> {
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
    // A draft's roster can't take the quiz yet, so there is nothing to tell them.
    const enrolled = await liveStudentIds(quiz.seasonId);
    await createNotificationsBulk(enrolled, {
      type: "QUIZ_PUBLISHED",
      title: `New quiz: ${quiz.title}`,
      link: QUIZ_GRADED_LINK,
    });
  });
}

/**
 * Answers released: ONLINE students with any graded attempt hear that the
 * answers are out, once. PAPER quizzes have no answers to release and notify
 * nobody — a paper score notifies when it is entered. Best-effort, after the
 * release has committed (spec D6).
 */
export async function notifyQuizAnswersReleased(quiz: {
  id: number;
  title: string;
  kind: "PAPER" | "ONLINE";
}): Promise<void> {
  if (quiz.kind !== "ONLINE") return;
  await bestEffort("notify:QUIZ_GRADED", async () => {
    const graded = await db.quizAttempt.findMany({
      where: { quizId: quiz.id, status: "GRADED", studentUser: liveUser },
      select: { studentUserId: true },
      distinct: ["studentUserId"],
    });
    await createNotificationsBulk(
      graded.map((a) => a.studentUserId),
      {
        type: "QUIZ_GRADED",
        title: `Answers are out: ${quiz.title}`,
        body: "You can now review the answers.",
        link: QUIZ_GRADED_LINK,
      },
    );
  });
}
