import { Router } from "express";

import { apiOk, apiError, forbidden } from "../lib/api-response";
import { parseId } from "../lib/parse-id";
import { idParam } from "../lib/http/params";
import { canViewStudent, pickScoredEnrollment } from "../lib/permissions";
import { computeEngagementForSeason } from "../lib/queries/engagement";
import { quizParticipation } from "../lib/queries/quiz-participation";
import { requireAuth, requireUser } from "../middleware/require-auth";

export const studentEngagementRouter = Router();

// requireAuth is attached per route (ruling X5): these routers share
// /api/v1/students and /api/v1/seasons with other routers.

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
  // v1 simply omitted the engagement card when the student had no active season (R83). An
  // endpoint has to say so; the picking and its 403-or-no_season rules are pickScoredEnrollment's.
  const enrollment = await pickScoredEnrollment(user, studentUserId, requestedSeasonId);
  if (enrollment === "forbidden") return forbidden(res);
  if (enrollment === "no_season") {
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
