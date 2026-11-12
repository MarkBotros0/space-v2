import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { PassingNumbers, SeasonEndCheck } from "../../../../../packages/shared/src/index";
import { attendancePct } from "./attendance-pct";
import { loadPassCriteria } from "../passing/criteria";
import { loadPassingNumbers } from "../passing/numbers";
import { MS_PER_MINUTE } from "../org-time";
import { liveAssignment, liveUser } from "../db/live";
import { ADMIN_SCORE_WHERE } from "../quizzes/admin-score";

/** Drops the attempts whose student has the admin's score on that quiz: nothing is left to mark. */
async function withoutAdminScored<A extends { quizId: number; studentUserId: number }>(
  client: Prisma.TransactionClient,
  attempts: A[],
): Promise<A[]> {
  if (attempts.length === 0) return attempts;
  const scored = await client.quizGrade.findMany({
    where: {
      quizId: { in: attempts.map((a) => a.quizId) },
      studentUserId: { in: attempts.map((a) => a.studentUserId) },
      ...ADMIN_SCORE_WHERE,
    },
    select: { quizId: true, studentUserId: true },
  });
  const keys = new Set(scored.map((g) => `${g.quizId}:${g.studentUserId}`));
  return attempts.filter((a) => !keys.has(`${a.quizId}:${a.studentUserId}`));
}

/** The end check without the scoring: its flag, its blockers and its ACTIVE live students. */
type SeasonEndRoster = Omit<SeasonEndCheck, "criteria" | "isDefault" | "available" | "students"> & {
  students: Omit<SeasonEndCheck["students"][number], "attendancePct" | "numbers">[];
};

/**
 * What End's review shows: the roster and blockers (`loadSeasonEndRoster`), the season's criteria
 * (its own, else the default) and every student's three numbers (`loadPassingNumbers`, the roster's
 * own: null ids), from which the screen computes each score as End will.
 */
export async function loadSeasonEndCheck(
  seasonId: number,
  now: Date,
  client: Prisma.TransactionClient = db,
): Promise<SeasonEndCheck> {
  const [roster, { criteria, isDefault }, { available, numbers }] = await Promise.all([
    loadSeasonEndRoster(seasonId, now, client),
    loadPassCriteria(seasonId, client),
    loadPassingNumbers(seasonId, null, client, now),
  ]);
  return {
    ...roster,
    criteria,
    isDefault,
    available,
    students: roster.students.map((s) => {
      const n = numbers.get(s.userId) ?? NOTHING_COUNTED;
      return { ...s, attendancePct: attendancePct(n.attendance.attended, n.attendance.total), numbers: n };
    }),
  };
}

/** A student the numbers don't name (none can be: both read the season's ACTIVE live students). */
const NOTHING_COUNTED: PassingNumbers = {
  attendance: { attended: 0, total: 0 },
  assignments: { submitted: 0, total: 0 },
  quizzes: { scored: 0, max: 0 },
};

/**
 * What stops a season from ending, and the students it would end for.
 * Blockers: essays handed in and awaiting review (one per student per essay;
 * an unwatched video or a missing forum post never blocks), quiz attempts
 * awaiting a grade (unless the admin has entered that student's score, which
 * counts instead, plan 4), and
 * sessions that have finished with an ACTIVE student unmarked. Soft-deleted
 * students and assignments never block.
 */
export async function loadSeasonEndRoster(
  seasonId: number,
  now: Date,
  client: Prisma.TransactionClient = db,
): Promise<SeasonEndRoster> {
  // Only students still ACTIVE in this season hold the season open.
  const activeStudentInSeason = {
    ...liveUser,
    seasonEnrollments: { some: { seasonId, status: "ACTIVE" as const } },
  };
  const [season, enrollments, sessions, submissions, attempts] = await Promise.all([
    client.season.findUniqueOrThrow({ where: { id: seasonId }, select: { graduatesOnPass: true } }),
    client.seasonEnrollment.findMany({
      where: { seasonId, status: "ACTIVE", studentUser: liveUser },
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
    client.assignmentPartWork.findMany({
      where: {
        status: "SUBMITTED",
        part: { kind: "ESSAY", assignment: { seasonId, ...liveAssignment } },
        studentUser: activeStudentInSeason,
      },
      orderBy: { id: "asc" },
      select: {
        publicId: true,
        part: { select: { assignment: { select: { title: true } } } },
        studentUser: { select: { name: true } },
      },
    }),
    client.quizAttempt.findMany({
      where: { status: "SUBMITTED", quiz: { seasonId }, studentUser: activeStudentInSeason },
      orderBy: { id: "asc" },
      select: {
        id: true,
        quizId: true,
        studentUserId: true,
        quiz: { select: { title: true } },
        studentUser: { select: { name: true } },
      },
    }),
  ]);

  const awaiting = await withoutAdminScored(client, attempts);

  const activeIds = enrollments.map((e) => e.studentUserId);
  const marks = await client.attendance.findMany({
    where: { session: { seasonId }, studentUserId: { in: activeIds } },
    select: { sessionId: true, studentUserId: true },
  });
  const marked = new Set(marks.map((m) => `${m.sessionId}:${m.studentUserId}`));

  const attendance = sessions
    .filter((s) => s.startsAt.getTime() + s.durationMinutes * MS_PER_MINUTE <= now.getTime())
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      // Only from the session that started on or after they joined: staff can't
      // truthfully mark a late joiner for a session held before they arrived.
      missing: enrollments.filter(
        (e) => e.enrolledAt.getTime() <= s.startsAt.getTime() && !marked.has(`${s.id}:${e.studentUserId}`),
      ).length,
    }))
    .filter((s) => s.missing > 0);

  return {
    graduatesOnPass: season.graduatesOnPass,
    blockers: {
      submissions: submissions.map((s) => ({
        publicId: s.publicId,
        assignmentTitle: s.part.assignment.title,
        studentName: s.studentUser.name,
      })),
      quizAttempts: awaiting.map((a) => ({
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
    })),
  };
}
