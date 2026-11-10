import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError, forbidden } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { isAdminOfSeason, isSuper } from "../../lib/rbac";
import { requireUser, requireRole } from "../../middleware/require-auth";
import {
  createEnrollmentRequestSchema,
  restoreEnrollmentRequestSchema,
  updateEnrollmentRequestSchema,
} from "../../../../../packages/shared/src/index";
import { idParam } from "../../lib/http/params";
import { parseOr400 } from "../../lib/http/validate";
import {
  ALREADY_ENROLLED,
  dropEnrolment,
  enrolStudent,
  restoreEnrolment,
} from "../../lib/enrolment/student-enrolments";

/**
 * Explicit enrollment — the endpoint v1 never had (spec 06 §7): its only
 * creation paths were "be added to a group" (which destroyed history, D2)
 * and CSV import. Group membership is NOT set here: groupId belongs to the
 * groups endpoints (PATCH /groups/:id → setGroupStudents), one writer per
 * fact, per-season membership through the enrollment (C9).
 */
export async function createEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const id = idParam(res, req.params.id, "student");
  if (id === null) return;

  const parsed = parseOr400(createEnrollmentRequestSchema, req.body, res, "Invalid enrollment body.");
  if (parsed === null) return;
  const { seasonId } = parsed;

  // Season-admin power over the TARGET season; SUPER passes inside the
  // predicate. Gate before any lookup — a refused caller learns nothing.
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  try {
    await enrolStudent(id, seasonId);
    const enrollment = await db.seasonEnrollment.findUniqueOrThrow({
      where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
      select: { id: true, seasonId: true, status: true },
    });
    return apiOk(res, enrollment, 201);
  } catch (err) {
    if (isUniqueViolation(err)) return alreadyEnrolled(res);
    throw err;
  }
}

function alreadyEnrolled(res: Response) {
  return apiError(res, "already_enrolled", ALREADY_ENROLLED, 409);
}

/**
 * Dropping: ACTIVE to WITHDRAWN (R48–R50), with an optional reason.
 * Addressed by (student, season) — the natural unique key — rather than a
 * bare enrollment id: the bare-id shape is exactly what let v1's document
 * delete lose its row-scoped gate unnoticed (D5's lesson, applied here).
 * The row is transitioned in place, never deleted. COMPLETED is refused for
 * everyone, before anything is read: finishing one student alone would skip
 * pass/fail, so End season and graduation are the only ways to complete a row.
 *
 * A seat write like any other: the season's share lock, then the person, then
 * the row. A drop goes in wholly before End's check or finds the season finished.
 */
export async function updateEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const seasonId = parseId(req.params.seasonId);
  if (id === null || seasonId === null) {
    return apiError(res, "bad_request", "Invalid student or season id.", 400);
  }

  const parsed = parseOr400(updateEnrollmentRequestSchema, req.body, res, "Invalid enrollment body.");
  if (parsed === null) return;
  if (parsed.status === "COMPLETED") {
    return apiError(
      res,
      "use_end_season",
      "Students finish a season when it ends. End the season to set results.",
      409,
    );
  }

  // R64's gate, moved BEFORE the lookup: v1 fetched the enrollment first and
  // gated second, so a refused caller still learned whether an arbitrary id
  // existed (R65).
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const { dropReason } = parsed;
  const outcome = await dropEnrolment(id, seasonId, dropReason);
  auditLog("enrollment.drop", user.userId, id);
  return apiOk(res, outcome);
}

/**
 * `POST /students/:id/enrollments/:seasonId/restore`: SUPER only. A seat write,
 * so it holds the season's share lock, then the person's, as adding does.
 */
export async function restoreEnrollment(req: Request, res: Response) {
  const user = requireRole(req, res, isSuper, "Only a super admin can bring a student back.");
  if (!user) return;
  const id = parseId(req.params.id);
  const seasonId = parseId(req.params.seasonId);
  if (id === null || seasonId === null) {
    return apiError(res, "bad_request", "Invalid student or season id.", 400);
  }
  const parsed = parseOr400(restoreEnrollmentRequestSchema, req.body ?? {}, res, "Invalid restore body.");
  if (parsed === null) return;

  const outcome = await restoreEnrolment(id, seasonId, { id: user.userId, override: parsed.override ?? false });

  auditLog("enrollment.restore", user.userId, id, { season: seasonId });
  return apiOk(res, { id: outcome.id, status: outcome.status });
}
