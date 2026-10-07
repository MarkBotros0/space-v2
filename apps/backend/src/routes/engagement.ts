import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import type { SessionUser } from "../lib/auth/tokens";
import { canAccessSeason, canViewStudent, staffScopeForSeason } from "../lib/permissions";
import { computeEngagementForSeason } from "../lib/queries/engagement";
import { canReadAllStudents } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const studentEngagementRouter = Router();
export const seasonEngagementRouter = Router();

// requireAuth is attached per route (ruling X5): these routers share
// /api/v1/students and /api/v1/seasons with other routers.

/**
 * May this caller see this student's score IN THIS SEASON?
 *
 * canViewStudent answers "may I see this student at all" — true if the
 * caller shares ANY season with them. That is not enough here: an earlier
 * draft passed that gate and then scored whatever ?seasonId= named, so an
 * admin of season A could read the student's season-B numbers (ruling C8 —
 * row-scoped at the API). The season-specific check:
 *   - STUDENT: only themselves (any of their own seasons);
 *   - SUPER / MENTOR: everything (canReadAllStudents);
 *   - ADMIN: must administer that season;
 *   - LEADER: must lead the group the student is in for that season (C9).
 */
async function mayScoreInSeason(
  user: SessionUser,
  studentUserId: number,
  seasonId: number,
  groupId: number | null,
): Promise<boolean> {
  if (user.role === "STUDENT") return user.userId === studentUserId;
  if (canReadAllStudents(user)) return true;
  const scope = await staffScopeForSeason(user, seasonId);
  if (scope === null) return false;
  if (scope.kind === "season") return true;
  return groupId !== null && scope.groupIds.includes(groupId);
}

/**
 * One student's engagement.
 *
 * v1's computeEngagementForStudent takes two integers and returns a score for
 * any student in any season, with no authorization of any kind (R64) — its
 * only protection was which page called it (R85). The gate is here, before the
 * call, and the PAYLOAD narrows by role as well (ruling C8 #2).
 */
studentEngagementRouter.get("/:id/engagement", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const studentUserId = parseId(req.params.id);
  if (studentUserId === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  if (!(await canViewStudent(user, studentUserId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const requestedSeasonId = parseId(
    typeof req.query.seasonId === "string" ? req.query.seasonId : undefined,
  );
  const candidates = await db.seasonEnrollment.findMany({
    where: {
      studentUserId,
      ...(requestedSeasonId !== null ? { seasonId: requestedSeasonId } : { status: "ACTIVE" }),
    },
    orderBy: { enrolledAt: "desc" },
    select: { seasonId: true, groupId: true },
  });
  // v1 simply omitted the engagement card when the student had no active
  // season (R83). An endpoint has to say so.
  if (candidates.length === 0) {
    return apiError(res, "no_season", "This student has no season to score.", 404);
  }

  // The newest enrolment the caller is scoped to. With ?seasonId there is one
  // candidate, so a season outside the caller's scope is a 403, never a
  // silently different season.
  let enrollment: { seasonId: number; groupId: number | null } | null = null;
  for (const candidate of candidates) {
    if (await mayScoreInSeason(user, studentUserId, candidate.seasonId, candidate.groupId)) {
      enrollment = candidate;
      break;
    }
  }
  if (!enrollment) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const rows = await computeEngagementForSeason(enrollment.seasonId, {
    studentUserIds: [studentUserId],
  });
  const row = rows[0];
  if (!row) return apiError(res, "no_season", "This student has no season to score.", 404);

  if (user.role === "STUDENT") {
    // The student's own arm: the two components, no composite, no flag (D9).
    // The composite is a staff triage number whose threshold exists to sort a
    // cohort; the components are facts the student can act on.
    return apiOk(res, {
      attendancePct: row.attendancePct,
      submissionPct: row.submissionPct,
      attendanceTotal: row.attendanceTotal,
      attendancePresent: row.attendancePresent,
      submissionsExpected: row.submissionsExpected,
      submissionsCompleted: row.submissionsCompleted,
      seasonId: row.seasonId,
      seasonTitle: row.seasonTitle,
    });
  }

  return apiOk(res, {
    studentUserId: row.studentUserId,
    seasonId: row.seasonId,
    seasonTitle: row.seasonTitle,
    atRisk: row.atRisk,
    score: row.score,
    attendancePct: row.attendancePct,
    submissionPct: row.submissionPct,
    attendanceTotal: row.attendanceTotal,
    attendancePresent: row.attendancePresent,
    submissionsExpected: row.submissionsExpected,
    submissionsCompleted: row.submissionsCompleted,
  });
});

/**
 * The cohort endpoint — the one the mentor dashboard and the reports screen
 * both consume. v1's per-student fan-out is unshippable on mobile (spec D10).
 */
seasonEngagementRouter.get("/:id/engagement", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);

  // A cohort listing is a staff surface. canAccessSeason admits students to
  // their own season, so the role check is separate and comes first.
  if (user.role === "STUDENT") {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }
  if (!(await canAccessSeason(user, seasonId))) {
    return apiError(res, "forbidden", "You don't have access to this.", 403);
  }

  const groupId = parseId(typeof req.query.groupId === "string" ? req.query.groupId : undefined);

  // A LEADER sees their own groups' students, not the season's. The same
  // helper the attendance roster narrows with, so the two cannot drift.
  // MENTOR and SUPER read the whole cohort (canReadAllStudents).
  const scope = await staffScopeForSeason(user, seasonId);
  if (user.role === "LEADER") {
    if (scope === null || scope.kind !== "groups") {
      return apiOk(res, { students: [] });
    }
    if (groupId !== null && !scope.groupIds.includes(groupId)) {
      return apiError(res, "forbidden", "You don't have access to this.", 403);
    }
    const enrollments = await db.seasonEnrollment.findMany({
      where: {
        seasonId,
        status: "ACTIVE",
        groupId: { in: groupId !== null ? [groupId] : scope.groupIds },
      },
      select: { studentUserId: true },
    });
    const students = await computeEngagementForSeason(seasonId, {
      studentUserIds: enrollments.map((e) => e.studentUserId),
    });
    return apiOk(res, { students });
  }

  const students = await computeEngagementForSeason(seasonId, {
    ...(groupId !== null ? { groupId } : {}),
  });
  return apiOk(res, { students });
});
