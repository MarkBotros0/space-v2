import type { EngagementRow } from "@space/shared";
// Relative, not "@space/shared": this is a VALUE import, and tsc's rootDir here
// is the repo root, so it emits without rewriting bare specifiers. A bare
// specifier at runtime resolves via node_modules back to the
// TypeScript source instead of the compiled sibling in dist/packages/shared/src/
// and the built server dies with ERR_MODULE_NOT_FOUND (CLAUDE.md). Five levels
// up from src/lib/queries/, not four — routes/ is one shallower.
import { isAtRisk } from "../../../../../packages/shared/src/index";

import { db } from "../../db/client";

export interface EngagementCohortOptions {
  /** Restrict to these students (a leader's roster, or a single detail view). */
  studentUserIds?: number[];
  /** Restrict to one group's students. */
  groupId?: number;
}

/**
 * Engagement for a whole cohort across one or more seasons, in a constant
 * number of queries.
 *
 * Plan 15 widened this from a single seasonId to a list. The reports screen's
 * MENTOR branch spans every season in the organisation; calling the
 * single-season version once per season would reintroduce a per-season fan-out
 * one layer up, which is the shape spec D9 exists to remove. The alternative —
 * a second, near-identical aggregation inside lib/queries/reports.ts — is
 * exactly the duplication that gave v1 three "submission %" arithmetics
 * (ruling C4, spec D2). One function, one formula, one place to fix it.
 *
 * Formula, ported verbatim from jpc-space/src/lib/engagement.ts:
 *   score = round(attendancePct * 0.5 + submissionPct * 0.5)   (domain 9 R53)
 *   attendance counts PRESENT and LATE alike                   (domain 9 R54)
 *   a submission counts as done at SUBMITTED|REVIEWED|RETURNED (domain 9 R57)
 *   assignment due dates are ignored                           (domain 9 R60)
 *
 * Two deliberate corrections, both Plan 12's:
 *   - the attendance denominator starts at the student's own enrolledAt
 *     (domain 9 R55, spec D8 #1);
 *   - targeting resolves through SeasonEnrollment.groupId, not GroupStudent
 *     (domain 9 R59, ruling C9).
 *
 * Nothing below reads Attendance.lateMinutes, so the score is untouched by
 * ruling C3's wrong-instant lateness defect (domain 9 R67). The surfaces that
 * DO inherit it are domain 4's, plus this domain's workbook cell — see
 * apps/backend/src/lib/exports/season-workbook.ts.
 */
export async function computeEngagementForSeasons(
  seasonIds: number[],
  opts: EngagementCohortOptions = {},
): Promise<EngagementRow[]> {
  if (seasonIds.length === 0) return [];

  // 1 — the cohort.
  const enrollments = await db.seasonEnrollment.findMany({
    where: {
      seasonId: { in: seasonIds },
      status: "ACTIVE",
      ...(opts.studentUserIds ? { studentUserId: { in: opts.studentUserIds } } : {}),
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    },
    select: {
      studentUserId: true,
      seasonId: true,
      enrolledAt: true,
      groupId: true,
      group: { select: { name: true } },
      // name only — NOT email. EngagementRow is domain 9's contract and Plan 12
      // serves it to LEADERs; widening it with an address would leak one to
      // every leader-facing engagement read (ruling C8). Reports derive the
      // email in their own query (loadStudentEmails in lib/queries/reports.ts).
      studentUser: { select: { name: true } },
      season: { select: { title: true } },
    },
  });
  if (enrollments.length === 0) return [];
  const ids = [...new Set(enrollments.map((e) => e.studentUserId))];

  // 2 — every past session in scope, with its season and instant, so each
  // student's denominator can be cut at their own enrolment date in memory.
  const now = new Date();
  const pastSessions = await db.session.findMany({
    where: { seasonId: { in: seasonIds }, startsAt: { lte: now } },
    select: { id: true, seasonId: true, startsAt: true },
  });

  // 3 — the cohort's present-marks over those sessions. Rows rather than a
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

  // 4 — the scope's assignments and their targets.
  const assignments = await db.assignment.findMany({
    where: { seasonId: { in: seasonIds }, deletedAt: null },
    select: {
      id: true,
      seasonId: true,
      isAllGroups: true,
      targets: { select: { groupId: true } },
    },
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
  const completed = new Set(submissions.map((s) => `${s.studentUserId}:${s.assignmentId}`));

  const presentBy = new Map<number, Set<number>>();
  for (const row of attendance) {
    const set = presentBy.get(row.studentUserId) ?? new Set<number>();
    set.add(row.sessionId);
    presentBy.set(row.studentUserId, set);
  }

  // Sessions and assignments bucketed by season once, so the per-enrolment loop
  // below is linear in its own season's rows rather than in the whole scope's.
  const sessionsBySeason = new Map<number, typeof pastSessions>();
  for (const s of pastSessions) {
    const list = sessionsBySeason.get(s.seasonId) ?? [];
    list.push(s);
    sessionsBySeason.set(s.seasonId, list);
  }
  const assignmentsBySeason = new Map<number, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsBySeason.get(a.seasonId) ?? [];
    list.push(a);
    assignmentsBySeason.set(a.seasonId, list);
  }

  return enrollments.map((e) => {
    const eligibleSessions = (sessionsBySeason.get(e.seasonId) ?? []).filter(
      (s) => s.startsAt.getTime() >= e.enrolledAt.getTime(),
    );
    const attendanceTotal = eligibleSessions.length;
    const present = presentBy.get(e.studentUserId) ?? new Set<number>();
    const attendancePresent = eligibleSessions.filter((s) => present.has(s.id)).length;
    const attendancePct =
      attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

    const expectedAssignments = (assignmentsBySeason.get(e.seasonId) ?? []).filter(
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
      seasonId: e.seasonId,
      seasonTitle: e.season.title,
      groupId: e.groupId,
      groupName: e.group?.name ?? null,
      atRisk: isAtRisk(base),
    };
  });
}

/** Plan 12's callers keep this signature; it is one season's worth of the above. */
export async function computeEngagementForSeason(
  seasonId: number,
  opts: EngagementCohortOptions = {},
): Promise<EngagementRow[]> {
  return computeEngagementForSeasons([seasonId], opts);
}
