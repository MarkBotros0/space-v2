import { Router } from "express";

import { db } from "../db/client";
import { apiOk, apiError, forbidden } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { idParam } from "../lib/http/params";
import type { SessionUser } from "../lib/auth/tokens";
import { canViewStudent, staffScopeForSeason } from "../lib/permissions";
import { computeEngagementForSeason } from "../lib/queries/engagement";
import { quizParticipation } from "../lib/queries/quiz-participation";
import { canReadAllStudents } from "../lib/rbac";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const studentEngagementRouter = Router();

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
  const studentUserId = idParam(res, req.params.id, "student");
  if (studentUserId === null) return;

  if (!(await canViewStudent(user, studentUserId))) return forbidden(res);

  const requestedSeasonId = parseId(typeof req.query.seasonId === "string" ? req.query.seasonId : undefined);
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
  //
  // Without ?seasonId, no in-scope candidate is no_season, not 403: a leader
  // opening a former student who is now ACTIVE in someone else's group has
  // nothing of theirs to score, and the card hides on no_season — a 403 made
  // it show an error whose retry could never succeed.
  let enrollment: { seasonId: number; groupId: number | null } | null = null;
  for (const candidate of candidates) {
    if (await mayScoreInSeason(user, studentUserId, candidate.seasonId, candidate.groupId)) {
      enrollment = candidate;
      break;
    }
  }
  if (!enrollment) {
    if (requestedSeasonId !== null) return forbidden(res);
    return apiError(res, "no_season", "This student has no season to score.", 404);
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

  // The student's page shows their quizzes too (owner, 2026-11-07).
  const quizzes = await quizParticipation(row.seasonId, studentUserId);
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
    ...quizzes,
  });
});
