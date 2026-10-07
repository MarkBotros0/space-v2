import type { EngagementRow } from "@space/shared";
// A VALUE import, so the relative path — never "@space/shared" (ruling X12).
// A bare specifier here survives tsc untouched and makes the BUILT server
// resolve node_modules/@space/shared back to TypeScript source:
// ERR_MODULE_NOT_FOUND at startup (CLAUDE.md, the routes/auth.ts note). Five
// levels up from src/lib/queries/.
import { isAtRisk } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";

export interface EngagementCohortOptions {
  /** Restrict to these students (a leader's roster, or a single detail view). */
  studentUserIds?: number[];
  /** Restrict to one group's students. */
  groupId?: number;
}

/**
 * Engagement for a whole cohort, in a constant number of queries.
 *
 * v1 issued four queries per student — 4N concurrently on the mentor dashboard
 * (R80), 4N sequentially on reports (R81) — and its own bulk helper was a
 * sequential loop over the single-student function and was never called anyway
 * (R82). Under React Query, which refetches on mount, on focus and on
 * reconnect, that shape re-issues the whole fan-out every time the app comes
 * back to the foreground (spec D10). This is five queries whether the cohort is
 * one student or four hundred.
 *
 * Formula, ported verbatim from jpc-space/src/lib/engagement.ts:
 *   score = round(attendancePct * 0.5 + submissionPct * 0.5)   (R53)
 *   attendance counts PRESENT and LATE alike                   (R54)
 *   a submission counts as done at SUBMITTED|REVIEWED|RETURNED (R57)
 *   assignment due dates are ignored                           (R60)
 *
 * Two deliberate corrections:
 *   - The attendance denominator is the past sessions at or after the student's
 *     own enrolledAt, not every past session in the season (R55, spec D8 #1).
 *     A student who joined in week six was scored against weeks one to five.
 *   - Assignment targeting resolves through SeasonEnrollment.groupId, not
 *     GroupStudent (R59, ruling C9).
 *
 * NOT corrected here, and not this domain's to correct: nothing below reads
 * Attendance.lateMinutes, so the score is untouched by ruling C3's
 * wrong-instant lateness defect. The absence-budget figures that DO inherit it
 * belong to domain 4 — see docs/superpowers/specs/domains/04-attendance.md.
 */
export async function computeEngagementForSeason(
  seasonId: number,
  opts: EngagementCohortOptions = {},
): Promise<EngagementRow[]> {
  // 1 — the cohort.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId,
      status: "ACTIVE",
      ...(opts.studentUserIds ? { studentUserId: { in: opts.studentUserIds } } : {}),
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    },
    select: {
      studentUserId: true,
      enrolledAt: true,
      groupId: true,
      group: { select: { name: true } },
      studentUser: { select: { name: true } },
      season: { select: { title: true } },
    },
  });
  if (enrollments.length === 0) return [];
  const ids = enrollments.map((e) => e.studentUserId);

  // 2 — every past session in the season, with its instant, so each student's
  // denominator can be cut at their own enrolment date in memory.
  const now = new Date();
  const pastSessions = await db.session.findMany({
    where: { seasonId, startsAt: { lte: now } },
    select: { id: true, startsAt: true },
  });

  // 3 — the cohort's attendance over those sessions. Rows rather than a
  // groupBy, because the per-student enrolment cutoff cannot be expressed as
  // one grouped aggregate. Still one query.
  const attendance =
    pastSessions.length === 0
      ? []
      : await db.attendance.findMany({
          where: {
            studentUserId: { in: ids },
            sessionId: { in: pastSessions.map((s) => s.id) },
            status: { in: ["PRESENT", "LATE"] },
          },
          select: { studentUserId: true, sessionId: true },
        });

  // 4 — the season's assignments and their targets.
  const assignments = await db.assignment.findMany({
    where: { seasonId, deletedAt: null },
    select: { id: true, isAllGroups: true, targets: { select: { groupId: true } } },
  });

  // 5 — the cohort's completed submissions against them.
  const submissions =
    assignments.length === 0
      ? []
      : await db.submission.findMany({
          where: {
            studentUserId: { in: ids },
            assignmentId: { in: assignments.map((a) => a.id) },
            status: { in: ["SUBMITTED", "REVIEWED", "RETURNED"] },
          },
          select: { studentUserId: true, assignmentId: true },
        });
  // Keyed as a set rather than v1's `a.submissions[0]`, which took whichever
  // row Prisma happened to return first (R61). Submission is unique on
  // (assignmentId, studentUserId), so there is only ever one — but "any
  // completed row counts" is the intent, and a set says so.
  const completed = new Set(submissions.map((s) => `${s.studentUserId}:${s.assignmentId}`));

  const presentBy = new Map<number, Set<number>>();
  for (const row of attendance) {
    const set = presentBy.get(row.studentUserId) ?? new Set<number>();
    set.add(row.sessionId);
    presentBy.set(row.studentUserId, set);
  }

  return enrollments.map((e) => {
    const eligibleSessions = pastSessions.filter(
      (s) => s.startsAt.getTime() >= e.enrolledAt.getTime(),
    );
    const attendanceTotal = eligibleSessions.length;
    const present = presentBy.get(e.studentUserId) ?? new Set<number>();
    const attendancePresent = eligibleSessions.filter((s) => present.has(s.id)).length;
    const attendancePct =
      attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

    const expectedAssignments = assignments.filter(
      (a) =>
        a.isAllGroups ||
        (e.groupId !== null && a.targets.some((t) => t.groupId === e.groupId)),
    );
    const submissionsExpected = expectedAssignments.length;
    const submissionsCompleted = expectedAssignments.filter((a) =>
      completed.has(`${e.studentUserId}:${a.id}`),
    ).length;
    const submissionPct =
      submissionsExpected > 0 ? Math.round((submissionsCompleted / submissionsExpected) * 100) : 0;

    const score = Math.round(attendancePct * 0.5 + submissionPct * 0.5);
    const base = {
      score,
      attendancePct,
      submissionPct,
      attendanceTotal,
      attendancePresent,
      submissionsExpected,
      submissionsCompleted,
    };

    return {
      ...base,
      studentUserId: e.studentUserId,
      studentName: e.studentUser.name,
      seasonId,
      seasonTitle: e.season.title,
      groupId: e.groupId,
      groupName: e.group?.name ?? null,
      // The one definition, from packages/shared. Never recomputed at a render
      // site (ruling C4) and never re-stated with a literal 60 (D7).
      atRisk: isAtRisk(base),
    };
  });
}

