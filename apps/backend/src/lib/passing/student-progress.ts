import type { StudentProgress } from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";
import { STAFF_MARK_SELECT } from "../assignments/submitted";
import type { SessionUser } from "../auth/tokens";
import { liveAssignment } from "../db/live";
import { canMarkSubmitted } from "../permissions";
import { countingScore } from "../quizzes/best-attempt";
import { toScore } from "../quizzes/score";
import { COUNTED_QUIZ, loadPassingNumbers } from "./numbers";

/*
 * One student's progress in one season, for staff (spec "Progress for staff"): the three numbers
 * and what is behind them. Each assignment with how it was submitted (in the app or marked by
 * staff, and who marked it), not-submitted first; each counted quiz with the student's counting
 * score, lowest share first. Ids, titles and scores only: no answers and no question text.
 */

type Season = { id: number; title: string; status: string };

/** The progress of a student the caller passed `pickScoredEnrollment` for, in that season. */
export async function loadStudentProgress(
  user: SessionUser,
  season: Season,
  studentUserId: number,
): Promise<StudentProgress | null> {
  const seasonActive = season.status === "ACTIVE";
  const [{ available, numbers }, assignments, quizzes, mayMark] = await Promise.all([
    loadPassingNumbers(season.id, [studentUserId]),
    loadAssignments(season.id, studentUserId),
    loadQuizzes(season.id, studentUserId),
    seasonActive ? canMarkSubmitted(user, season.id, studentUserId) : Promise.resolve(false),
  ]);
  const own = numbers.get(studentUserId);
  if (!own) return null;
  return {
    seasonId: season.id,
    seasonTitle: season.title,
    seasonActive,
    canMark: mayMark,
    available,
    numbers: own,
    assignments,
    quizzes,
  };
}

async function loadAssignments(seasonId: number, studentUserId: number): Promise<StudentProgress["assignments"]> {
  const rows = await db.assignment.findMany({
    where: { seasonId, ...liveAssignment },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      dueAt: true,
      submissions: {
        where: { studentUserId },
        select: { submittedAt: true, ...STAFF_MARK_SELECT },
      },
    },
  });
  const out = rows.map((a) => {
    const s = a.submissions[0] ?? null;
    const mark = s?.staffMark ?? null;
    return {
      id: a.id,
      title: a.title,
      dueAt: a.dueAt?.toISOString() ?? null,
      submitted: s?.submittedAt ? ("app" as const) : mark ? ("staff" as const) : null,
      staffMark: mark ? { markedAt: mark.markedAt.toISOString(), markedByName: mark.markedBy?.name ?? null } : null,
    };
  });
  // Not submitted first; the due-date order holds within each (a stable sort).
  return out.sort((a, b) => Number(a.submitted !== null) - Number(b.submitted !== null));
}

async function loadQuizzes(seasonId: number, studentUserId: number): Promise<StudentProgress["quizzes"]> {
  const rows = await db.quiz.findMany({
    where: { seasonId, ...COUNTED_QUIZ },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      kind: true,
      maxScore: true,
      grades: { where: { studentUserId }, select: { score: true } },
      attempts: {
        where: { studentUserId, status: "GRADED" },
        select: { status: true, totalScore: true, attemptNumber: true },
      },
    },
  });
  const out = rows.map((q) => {
    const grade = q.grades[0] ?? null;
    const score =
      q.kind === "ONLINE" ? (countingScore(grade, q.attempts)?.score ?? null) : toScore(grade?.score ?? null);
    return { id: q.id, title: q.title, kind: q.kind, score, maxScore: q.maxScore };
  });
  // Lowest share first; no score counts as 0, as it does in the number.
  const share = (q: (typeof out)[number]) => (q.maxScore > 0 ? (q.score ?? 0) / q.maxScore : 0);
  return out.sort((a, b) => share(a) - share(b) || a.id - b.id);
}
