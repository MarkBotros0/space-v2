import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { markSessionsStale } from "../../lib/auth/session-validity";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { enrollStudentInSeason } from "../../lib/queries/students";
import { isAdminOfSeason } from "../../lib/rbac";
import { requireUser } from "../../middleware/require-auth";
import {
  createEnrollmentRequestSchema,
  updateEnrollmentRequestSchema,
} from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";

/**
 * Explicit enrollment — the endpoint v1 never had (spec 06 §7): its only
 * creation paths were "be added to a group" (which destroyed history, D2)
 * and CSV import. Group membership is NOT set here: groupId belongs to the
 * groups endpoints (PATCH /groups/:id → setGroupStudents), one writer per
 * fact, per-season membership through the enrollment (C9).
 */
export async function createEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid student id.", 400);

  const parsed = createEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);
  const { seasonId } = parsed.data;

  // Season-admin power over the TARGET season; SUPER passes inside the
  // predicate. Gate before any lookup — a refused caller learns nothing.
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const season = await db.season.findFirst({
    where: { id: seasonId, deletedAt: null },
    select: { id: true },
  });
  if (!season) return apiError(res, "not_found", "Season not found.", 404);

  const student = await db.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return apiError(res, "not_found", "Student not found.", 404);

  try {
    // R2 / R47 / D1 live in enrollStudentInSeason, which the bulk importer
    // calls too (Plan 17 D-16.8): one enrolment per student per season, EVER
    // (a WITHDRAWN row is history, not an obstacle); entry always ACTIVE; the
    // student's sessions go stale so the derived current season is re-read.
    const outcome = await db.$transaction((tx) => enrollStudentInSeason(tx, id, seasonId));
    if (outcome === "already_enrolled") {
      return apiError(res, "already_enrolled", "This student already has an enrollment in that season.", 409);
    }
    const enrollment = await db.seasonEnrollment.findUniqueOrThrow({
      where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
      select: { id: true, seasonId: true, status: true },
    });
    return apiOk(res, enrollment, 201);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return apiError(res, "already_enrolled", "This student already has an enrollment in that season.", 409);
    }
    throw err;
  }
}

/**
 * The enrollment state machine's only two transitions, both out of ACTIVE
 * (R48–R50): → WITHDRAWN (drop, with optional reason) and → COMPLETED.
 * Addressed by (student, season) — the natural unique key — rather than a
 * bare enrollment id: the bare-id shape is exactly what let v1's document
 * delete lose its row-scoped gate unnoticed (D5's lesson, applied here).
 * The row is transitioned in place, never deleted, never resurrected.
 */
export async function updateEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const id = parseId(req.params.id);
  const seasonId = parseId(req.params.seasonId);
  if (id === null || seasonId === null) {
    return apiError(res, "bad_request", "Invalid student or season id.", 400);
  }

  const parsed = updateEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);

  // R64's gate, moved BEFORE the lookup: v1 fetched the enrollment first and
  // gated second, so a refused caller still learned whether an arbitrary id
  // existed (R65).
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const enrollment = await db.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: id, seasonId } },
    select: { id: true, status: true },
  });
  if (!enrollment) return apiError(res, "not_found", "Enrollment not found.", 404);
  if (enrollment.status !== "ACTIVE") {
    // R49 (drop refuses non-ACTIVE) generalised to both transitions; there
    // is no path out of a terminal state (R50).
    return apiError(res, "not_active", "Only an active enrollment can be completed or dropped.", 409);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.seasonEnrollment.update({
      where: { id: enrollment.id },
      data:
        parsed.data.status === "WITHDRAWN"
          ? { status: "WITHDRAWN", droppedAt: new Date(), dropReason: parsed.data.dropReason ?? null }
          : { status: "COMPLETED", completedAt: new Date() },
      select: { id: true, status: true },
    });
    // The student's derived current season may have just changed.
    await markSessionsStale(tx, [id]);
    return row;
  });
  auditLog(
    parsed.data.status === "WITHDRAWN" ? "enrollment.drop" : "enrollment.complete",
    user.userId,
    id,
  );
  return apiOk(res, updated);
}
