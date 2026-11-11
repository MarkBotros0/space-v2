import { db } from "../../db/client";
import { liveUser } from "../db/live";
import type { QuizLive, QuizLiveRow } from "../../../../../packages/shared/src/index";
import { liveState } from "./live-state";

/*
 * The live screen's read (staff only; the route gates it). Bounded queries whatever
 * the number of students: users, enrolments, latest attempts, exit aggregates.
 * Nothing here selects an answer.
 */

const byName = (a: QuizLiveRow, b: QuizLiveRow) => (a.studentName ?? "").localeCompare(b.studentName ?? "");

/** Open attempts with exits first, then the other open ones, then not started, then finished; each by name. */
const rank = (r: QuizLiveRow): number => {
  if (r.state === "in_progress") return r.exits > 0 ? 0 : 1;
  return r.state === "not_started" ? 2 : 3;
};

export function sortLiveRows(rows: QuizLiveRow[]): QuizLiveRow[] {
  return [...rows].sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

export async function loadLive(
  quiz: { id: number; title: string; seasonId: number; timeLimitMinutes: number | null },
  studentIds: number[],
  now: Date,
): Promise<QuizLive> {
  const [users, enrollments, attempts] = await Promise.all([
    db.user.findMany({ where: { id: { in: studentIds }, ...liveUser }, select: { id: true, name: true } }),
    db.seasonEnrollment.findMany({
      where: { seasonId: quiz.seasonId, studentUserId: { in: studentIds } },
      select: { studentUserId: true, group: { select: { name: true } } },
    }),
    db.quizAttempt.findMany({
      where: { quizId: quiz.id, studentUserId: { in: studentIds } },
      orderBy: [{ studentUserId: "asc" }, { attemptNumber: "desc" }],
      distinct: ["studentUserId"],
      select: { id: true, studentUserId: true, status: true, endReason: true, deadlineAt: true },
    }),
  ]);
  const exitStats = await db.quizAttemptEvent.groupBy({
    by: ["attemptId"],
    where: { attemptId: { in: attempts.map((a) => a.id) }, kind: { in: ["EXIT", "RELAUNCH"] } },
    _count: { _all: true },
    _max: { leftAt: true },
  });
  const statsBy = new Map(exitStats.map((s) => [s.attemptId, s]));
  const groupBy = new Map(enrollments.map((e) => [e.studentUserId, e.group?.name ?? null]));
  const attemptBy = new Map(attempts.map((a) => [a.studentUserId, a]));

  const rows = users.map((u): QuizLiveRow => {
    const attempt = attemptBy.get(u.id) ?? null;
    const state = liveState(attempt);
    const stats = attempt ? statsBy.get(attempt.id) : undefined;
    return {
      studentUserId: u.id,
      studentName: u.name,
      groupName: groupBy.get(u.id) ?? null,
      state,
      deadlineAt: state === "in_progress" ? (attempt?.deadlineAt?.toISOString() ?? null) : null,
      exits: stats?._count._all ?? 0,
      lastExitAt: stats?._max.leftAt?.toISOString() ?? null,
    };
  });
  return {
    quizId: quiz.id,
    title: quiz.title,
    timeLimitMinutes: quiz.timeLimitMinutes,
    serverNow: now.toISOString(),
    rows: sortLiveRows(rows),
  };
}
