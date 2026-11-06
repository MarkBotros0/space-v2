import { db } from "../../db/client";
import type { SeasonEndCheck } from "../../../../../packages/shared/src/index";
import { attendancePct } from "./attendance-pct";

/**
 * What stops a season from ending, and the students it would end for.
 * Blockers: SUBMITTED submissions and quiz attempts awaiting a grade, and
 * sessions that have finished with an ACTIVE student unmarked. Soft-deleted
 * students and assignments never block.
 */
export async function loadSeasonEndCheck(seasonId: number, now: Date): Promise<SeasonEndCheck> {
  const [enrollments, sessions, submissions, attempts] = await Promise.all([
    db.seasonEnrollment.findMany({
      where: { seasonId, status: "ACTIVE", studentUser: { deletedAt: null } },
      orderBy: { studentUser: { name: "asc" } },
      select: { studentUserId: true, studentUser: { select: { name: true } }, group: { select: { name: true } } },
    }),
    db.session.findMany({
      where: { seasonId },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true, durationMinutes: true },
    }),
    db.submission.findMany({
      where: {
        status: "SUBMITTED",
        assignment: { seasonId, deletedAt: null },
        studentUser: { deletedAt: null },
      },
      orderBy: { id: "asc" },
      select: {
        publicId: true,
        assignment: { select: { title: true } },
        studentUser: { select: { name: true } },
      },
    }),
    db.quizAttempt.findMany({
      where: { status: "SUBMITTED", quiz: { seasonId }, studentUser: { deletedAt: null } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        quizId: true,
        quiz: { select: { title: true } },
        studentUser: { select: { name: true } },
      },
    }),
  ]);

  const activeIds = enrollments.map((e) => e.studentUserId);
  const marks = await db.attendance.findMany({
    where: { session: { seasonId }, studentUserId: { in: activeIds } },
    select: { sessionId: true, studentUserId: true, status: true },
  });
  const markedBySession = new Map<number, number>();
  const attendedByStudent = new Map<number, number>();
  for (const m of marks) {
    markedBySession.set(m.sessionId, (markedBySession.get(m.sessionId) ?? 0) + 1);
    if (m.status === "PRESENT" || m.status === "LATE") {
      attendedByStudent.set(m.studentUserId, (attendedByStudent.get(m.studentUserId) ?? 0) + 1);
    }
  }

  const attendance = sessions
    .filter((s) => s.startsAt.getTime() + s.durationMinutes * 60_000 <= now.getTime())
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      missing: activeIds.length - (markedBySession.get(s.id) ?? 0),
    }))
    .filter((s) => s.missing > 0);

  return {
    blockers: {
      submissions: submissions.map((s) => ({
        publicId: s.publicId,
        assignmentTitle: s.assignment.title,
        studentName: s.studentUser.name,
      })),
      quizAttempts: attempts.map((a) => ({
        quizId: a.quizId,
        attemptId: a.id,
        quizTitle: a.quiz.title,
        studentName: a.studentUser.name,
      })),
      attendance,
    },
    students: enrollments.map((e) => ({
      userId: e.studentUserId,
      name: e.studentUser.name,
      groupName: e.group?.name ?? null,
      attendancePct: attendancePct(attendedByStudent.get(e.studentUserId) ?? 0, sessions.length),
    })),
  };
}
