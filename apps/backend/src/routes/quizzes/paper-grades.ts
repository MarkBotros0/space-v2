import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { canGradeQuiz } from "../../lib/permissions";
import { visibleStudentIdsForQuiz } from "../../lib/quiz-scope";
import { requireUser } from "../../middleware/require-auth";
import { saveQuizGrades } from "../../lib/quizzes/paper-grades";
import { saveQuizGradesRequestSchema } from "../../../../../packages/shared/src/index";
import { notifyQuizGraded } from "../../lib/quizzes/notify";
import { idParam } from "../../lib/http/params";
import { notFound } from "../../lib/http/not-found";
import { parseOr400 } from "../../lib/http/validate";
import { liveUser } from "../../lib/db/live";

/** Build the sheet for a scope. Shared by the GET and by the POST's response. */
async function buildGradeSheet(quizId: number, studentIds: number[]) {
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      title: true,
      kind: true,
      maxScore: true,
      seasonId: true,
      session: { select: { title: true } },
    },
  });
  if (!quiz) return null;

  const [students, grades, enrollments] = await Promise.all([
    db.user.findMany({
      // R100: deleted users are not on the sheet; ordered by name.
      where: { id: { in: studentIds }, ...liveUser },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.quizGrade.findMany({
      where: { quizId, studentUserId: { in: studentIds } },
      select: {
        studentUserId: true,
        score: true,
        notes: true,
        gradedAt: true,
        gradedBy: { select: { name: true } },
      },
    }),
    // The group each student is in this season, so the sheet can list them by group.
    db.seasonEnrollment.findMany({
      where: { seasonId: quiz.seasonId, studentUserId: { in: studentIds } },
      select: { studentUserId: true, group: { select: { name: true } } },
    }),
  ]);
  const gradeBy = new Map(grades.map((g) => [g.studentUserId, g]));
  const groupBy = new Map(enrollments.map((e) => [e.studentUserId, e.group?.name ?? null]));

  return {
    id: quiz.id,
    title: quiz.title,
    kind: quiz.kind,
    maxScore: quiz.maxScore,
    seasonId: quiz.seasonId,
    sessionTitle: quiz.session?.title ?? null,
    studentCount: studentIds.length,
    rows: students.map((s) => {
      const g = gradeBy.get(s.id);
      return {
        studentUserId: s.id,
        studentName: s.name,
        groupName: groupBy.get(s.id) ?? null,
        score: g?.score ?? null,
        notes: g?.notes ?? null,
        gradedAt: g?.gradedAt ?? null,
        gradedByName: g?.gradedBy?.name ?? null,
      };
    }),
  };
}

export async function getGradeSheet(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({ where: { id }, select: { seasonId: true } });
  if (!quiz) return notFound(res, "Quiz");
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) return forbidden(res);

  const sheet = await buildGradeSheet(id, studentIds);
  if (!sheet) return notFound(res, "Quiz");
  return apiOk(res, sheet);
}

/**
 * Save PAPER grades.
 *
 * The v1 action this replaces (saveQuizGradesAction) is the domain's
 * authorization hole, twice over:
 *
 *   (a) R86 — its season check was written
 *       `user.role === "LEADER" && !(await isLeaderInSeason(...))`, so an ADMIN
 *       of any season passed with no scope check whatsoever. Every other write
 *       in the domain routes through canManageQuiz/canGradeQuiz, both of which
 *       check the season. This one did not.
 *   (b) R93 — it then iterated the caller-supplied array and upserted every
 *       studentUserId verbatim, with no check that the student was in the
 *       caller's groups, in the quiz's season, or enrolled anywhere. The only
 *       scoping in the whole system was the array the PAGE passed to the READ.
 *
 * All three of D1's corrections are here: one gate for every role, a
 * server-derived visible set that every entry must be inside, and whole-batch
 * rejection so a client bug is loud rather than half-applied. The upserts and
 * deletes also share one transaction — v1 ran two sequential unbatched loops
 * (R95), so a failure at student 15 of 30 left half the class graded, some of
 * them notified, and returned an error as though nothing had happened.
 */
export async function saveGrades(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "quiz");
  if (id === null) return;

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, maxScore: true, seasonId: true, resultsReleasedAt: true },
  });
  if (!quiz) return notFound(res, "Quiz");

  // (a) One gate, no role-conditional branch.
  if (!(await canGradeQuiz(user, id))) return forbidden(res);

  // R94/D10: a QuizGrade against an ONLINE quiz is invisible to the student and
  // counts everywhere else.
  if (quiz.kind !== "PAPER") {
    return apiError(res, "wrong_quiz_kind", "This is an online quiz — grade its attempts.", 409);
  }

  const parsed = parseOr400(saveQuizGradesRequestSchema, req.body, res, "Invalid grade entries.");
  if (parsed === null) return;

  // (b) Derived here, never taken from the request.
  const studentIds = await visibleStudentIdsForQuiz(user, quiz.seasonId);
  if (studentIds === null) return forbidden(res);
  const visible = new Set(studentIds);

  // (c) Validate the WHOLE batch before writing any of it.
  for (const entry of parsed.entries) {
    if (!visible.has(entry.studentUserId)) {
      return apiError(res, "student_not_in_scope", `Student ${entry.studentUserId} is not in your groups.`, 403);
    }
    // R88/D7: the only bound in v1 was Math.min in the form, so an above-max
    // score stored fine and rendered as a >100% average in the student's own
    // list and in the season export.
    if (entry.score !== null && entry.score > quiz.maxScore) {
      return apiError(res, "score_exceeds_max", `This quiz is out of ${quiz.maxScore}.`, 400);
    }
  }

  const existing = await db.quizGrade.findMany({
    where: { quizId: id, studentUserId: { in: parsed.entries.map((e) => e.studentUserId) } },
    select: { studentUserId: true, score: true },
  });
  const previousScore = new Map(existing.map((g) => [g.studentUserId, g.score]));

  await saveQuizGrades(id, parsed.entries, user.userId);

  // D8's single rule, shared with the essay path: a first grade or a changed
  // score notifies; a no-op re-save is silent. v1's two paths disagreed.
  const notifyIds = parsed.entries
    .filter((e) => e.score !== null && previousScore.get(e.studentUserId) !== e.score)
    .map((e) => e.studentUserId);
  // Held results stay quiet: the release notifies everyone graded by then.
  if (notifyIds.length > 0 && quiz.resultsReleasedAt !== null) {
    // Best-effort, outside the transaction. v1 issued three queries per
    // student here, one student at a time (R96); createNotificationsBulk
    // batches the whole set.
    await notifyQuizGraded(notifyIds, `Quiz graded: ${quiz.title}`, "Your quiz has been graded.");
  }

  const sheet = await buildGradeSheet(id, studentIds);
  if (!sheet) return notFound(res, "Quiz");
  return apiOk(res, sheet);
}
