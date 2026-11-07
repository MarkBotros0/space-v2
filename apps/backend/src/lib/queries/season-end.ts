import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { SeasonEndCheck } from "../../../../../packages/shared/src/index";
import { attendancePct } from "./attendance-pct";

/**
 * What stops a season from ending, and the students it would end for.
 * Blockers: SUBMITTED submissions and quiz attempts awaiting a grade, and
 * sessions that have finished with an ACTIVE student unmarked. Soft-deleted
 * students and assignments never block.
 */
export async function loadSeasonEndCheck(
  seasonId: number,
  now: Date,
  client: Prisma.TransactionClient = db,
): Promise<SeasonEndCheck> {
  // Only students still ACTIVE in this season hold the season open.
  const activeStudentInSeason = {
    deletedAt: null,
    seasonEnrollments: { some: { seasonId, status: "ACTIVE" as const } },
  };
  const [season, enrollments, sessions, submissions, attempts] = await Promise.all([
    client.season.findUniqueOrThrow({ where: { id: seasonId }, select: { graduatesOnPass: true } }),
    client.seasonEnrollment.findMany({
      where: { seasonId, status: "ACTIVE", studentUser: { deletedAt: null } },
      orderBy: { studentUser: { name: "asc" } },
      select: {
        studentUserId: true,
        enrolledAt: true,
        studentUser: { select: { name: true, graduationYear: true } },
        group: { select: { name: true } },
      },
    }),
    client.session.findMany({
      where: { seasonId },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true, durationMinutes: true },
    }),
    client.submission.findMany({
      where: {
        status: "SUBMITTED",
        assignment: { seasonId, deletedAt: null },
        studentUser: activeStudentInSeason,
      },
      orderBy: { id: "asc" },
      select: {
        publicId: true,
        assignment: { select: { title: true } },
        studentUser: { select: { name: true } },
      },
    }),
    client.quizAttempt.findMany({
      where: { status: "SUBMITTED", quiz: { seasonId }, studentUser: activeStudentInSeason },
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
  const marks = await client.attendance.findMany({
    where: { session: { seasonId }, studentUserId: { in: activeIds } },
    select: { sessionId: true, studentUserId: true, status: true },
  });
  const marked = new Set(marks.map((m) => `${m.sessionId}:${m.studentUserId}`));
  const attendedByStudent = new Map<number, number>();
  for (const m of marks) {
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
      // Only from the session that started on or after they joined: staff can't
      // truthfully mark a late joiner for a session held before they arrived.
      missing: enrollments.filter(
        (e) =>
          e.enrolledAt.getTime() <= s.startsAt.getTime() && !marked.has(`${s.id}:${e.studentUserId}`),
      ).length,
    }))
    .filter((s) => s.missing > 0);

  return {
    graduatesOnPass: season.graduatesOnPass,
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
      graduationYear: e.studentUser.graduationYear,
      attendancePct: attendancePct(attendedByStudent.get(e.studentUserId) ?? 0, sessions.length),
    })),
  };
}
