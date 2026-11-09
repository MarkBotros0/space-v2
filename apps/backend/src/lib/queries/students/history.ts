import type { StudentAttendanceHistoryItem, StudentSubmissionItem } from "@space/shared";

import { db } from "../../../db/client";
import type { SessionUser } from "../../auth/tokens";
import { isAdminOfSeason, isMentor, isSuper } from "../../rbac";
import { isLate } from "../assignments";

/**
 * Which of a student's enrolments a caller may read anything about (REG-83, and
 * the spec's "What people can see of earlier seasons"). The same rows each
 * underlying gate admits: SUPER and MENTOR read every season; an ADMIN the seasons
 * they administer (canViewSubmission, attendanceScopeFor); a LEADER the seasons
 * whose ENROLLMENT names one of their groups (ruling C9). Those claims hold only
 * live seasons, so staff see nothing of a season they don't serve in now, even one
 * they once ran. The detail's enrolment list and season-scoped notes follow this
 * too; the people picker is the one exception and reads on its own. A STUDENT has
 * no such surface here; the detail gives a person their own rows itself.
 */
export function canReadEnrollmentHistory(user: SessionUser, e: { seasonId: number; groupId: number | null }): boolean {
  if (isSuper(user) || isMentor(user)) return true;
  if (user.role === "ADMIN") return isAdminOfSeason(user, e.seasonId);
  if (user.role === "LEADER") return e.groupId !== null && user.groupLeaderIds.includes(e.groupId);
  return false;
}

/** The season ids of this student's enrolments the caller may read history for. */
export async function readableSeasonIds(user: SessionUser, studentUserId: number): Promise<number[]> {
  const enrollments = await db.seasonEnrollment.findMany({
    where: { studentUserId },
    select: { seasonId: true, groupId: true },
  });
  return enrollments.filter((e) => canReadEnrollmentHistory(user, e)).map((e) => e.seasonId);
}

/**
 * Per-enrolment attendance % in two queries (v1 ran two per enrolment, R76).
 * The formula is Plan 12's engagement one, so the history figure and the
 * dashboard figure for the same season agree: past sessions from the student's
 * own enrolment date; PRESENT and LATE both count.
 */
export async function attendancePctByEnrollment(
  studentUserId: number,
  enrollments: { id: number; seasonId: number; enrolledAt: Date }[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (enrollments.length === 0) return result;

  const sessions = await db.session.findMany({
    where: { seasonId: { in: enrollments.map((e) => e.seasonId) }, startsAt: { lte: new Date() } },
    select: { id: true, seasonId: true, startsAt: true },
  });
  const present = new Set(
    (
      await db.attendance.findMany({
        where: {
          studentUserId,
          sessionId: { in: sessions.map((x) => x.id) },
          status: { in: ["PRESENT", "LATE"] },
        },
        select: { sessionId: true },
      })
    ).map((a) => a.sessionId),
  );

  for (const e of enrollments) {
    const eligible = sessions.filter(
      (x) => x.seasonId === e.seasonId && x.startsAt.getTime() >= e.enrolledAt.getTime(),
    );
    const attended = eligible.filter((x) => present.has(x.id)).length;
    result.set(e.id, eligible.length > 0 ? Math.round((attended / eligible.length) * 100) : 0);
  }
  return result;
}

/**
 * `attendancePctByEnrollment` for many students at once: two queries however
 * many people, same formula. Null when none of the season's sessions fell on
 * or after the person's enrolment, so "no sessions" isn't shown as 0%.
 */
export async function attendancePctForEnrollments(
  enrollments: { id: number; studentUserId: number; seasonId: number; enrolledAt: Date }[],
): Promise<Map<number, number | null>> {
  const result = new Map<number, number | null>();
  if (enrollments.length === 0) return result;

  const sessions = await db.session.findMany({
    where: { seasonId: { in: [...new Set(enrollments.map((e) => e.seasonId))] }, startsAt: { lte: new Date() } },
    select: { id: true, seasonId: true, startsAt: true },
  });
  const present = new Set(
    (
      await db.attendance.findMany({
        where: {
          studentUserId: { in: [...new Set(enrollments.map((e) => e.studentUserId))] },
          sessionId: { in: sessions.map((x) => x.id) },
          status: { in: ["PRESENT", "LATE"] },
        },
        select: { studentUserId: true, sessionId: true },
      })
    ).map((a) => `${a.studentUserId}:${a.sessionId}`),
  );

  for (const e of enrollments) {
    const eligible = sessions.filter(
      (x) => x.seasonId === e.seasonId && x.startsAt.getTime() >= e.enrolledAt.getTime(),
    );
    const attended = eligible.filter((x) => present.has(`${e.studentUserId}:${x.id}`)).length;
    result.set(e.id, eligible.length > 0 ? Math.round((attended / eligible.length) * 100) : null);
  }
  return result;
}

const HISTORY_LIMIT = 100; // v1's `take: 100` on both lists

/** `GET /students/:id/attendance` — newest sessions first, across readable seasons. */
export async function loadStudentAttendanceHistory(
  user: SessionUser,
  studentUserId: number,
): Promise<StudentAttendanceHistoryItem[]> {
  const seasonIds = await readableSeasonIds(user, studentUserId);
  if (seasonIds.length === 0) return [];
  const rows = await db.attendance.findMany({
    where: { studentUserId, session: { seasonId: { in: seasonIds } } },
    orderBy: [{ session: { startsAt: "desc" } }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: {
      status: true,
      session: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          seasonId: true,
          season: { select: { title: true } },
        },
      },
    },
  });
  return rows.map((a) => ({
    sessionId: a.session.id,
    sessionTitle: a.session.title,
    startsAt: a.session.startsAt.toISOString(),
    seasonId: a.session.seasonId,
    seasonTitle: a.session.season.title,
    status: a.status,
  }));
}

/**
 * `GET /students/:id/submissions` — newest first across readable seasons.
 * Never a DRAFT: that is the student's private work in progress, hidden from
 * every reviewer surface (the queue, canReviewSubmission's callers), and v1's
 * list showing it was the same leak by another door.
 */
export async function loadStudentSubmissions(
  user: SessionUser,
  studentUserId: number,
): Promise<StudentSubmissionItem[]> {
  const seasonIds = await readableSeasonIds(user, studentUserId);
  if (seasonIds.length === 0) return [];
  const rows = await db.submission.findMany({
    where: {
      studentUserId,
      status: { not: "DRAFT" },
      assignment: { seasonId: { in: seasonIds }, deletedAt: null },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: {
      publicId: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          seasonId: true,
          season: { select: { title: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    publicId: r.publicId,
    assignmentId: r.assignment.id,
    assignmentTitle: r.assignment.title,
    status: r.status,
    isLate: isLate(r.submittedAt, r.assignment.dueAt),
    submittedAt: r.submittedAt?.toISOString() ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    seasonId: r.assignment.seasonId,
    seasonTitle: r.assignment.season.title,
  }));
}
