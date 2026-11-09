import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError } from "../../lib/api-response";
import { markSessionsStale } from "../../lib/auth/session-validity";
import { auditLog } from "../../lib/audit";
import { parseId } from "../../lib/parse-id";
import { isUniqueViolation } from "../../lib/prisma-errors";
import { isAdminOfSeason, isSuper } from "../../lib/rbac";
import {
  isSeasonFinished,
  lockPeople,
  readSeatSeason,
  refusalStatus,
  restoreStudentSeat,
  seatStudents,
  type SeatRefusal,
} from "../../lib/roles";
import { requireUser } from "../../middleware/require-auth";
import {
  createEnrollmentRequestSchema,
  restoreEnrollmentRequestSchema,
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

  try {
    const refusal = await db.$transaction((tx) => enrollOne(tx, id, seasonId));
    if (refusal) return apiError(res, refusal.code, refusal.message, refusalStatus(refusal));
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

const ALREADY_ENROLLED = "This student already has an enrollment in that season.";

function alreadyEnrolled(res: Response) {
  return apiError(res, "already_enrolled", ALREADY_ENROLLED, 409);
}

/**
 * R2 / R47 / D1 live in enrollStudentsInSeason, which the bulk importer reaches too
 * (Plan 17 D-16.8): one enrolment per student per season, EVER (a WITHDRAWN row
 * is history, not an obstacle); entry always ACTIVE; the student's sessions go
 * stale so the derived current season is re-read. Who may join is `seatStudents`.
 */
async function enrollOne(tx: Prisma.TransactionClient, id: number, seasonId: number): Promise<SeatRefusal | null> {
  const season = await readSeatSeason(tx, seasonId);
  if (!season) return { code: "not_found", message: "Season not found." };
  if (isSeasonFinished(season)) return { code: "season_finished", message: "This season has finished." };

  const student = await tx.user.findFirst({
    where: { id, role: "STUDENT", deletedAt: null },
    select: { id: true },
  });
  if (!student) return { code: "not_found", message: "Student not found." };

  const { refused } = await seatStudents(tx, season, [id]);
  const refusal = refused[0]?.refusal ?? null;
  return refusal?.code === "in_season" ? { code: "already_enrolled", message: ALREADY_ENROLLED } : refusal;
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

  const parsed = updateEnrollmentRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);
  if (parsed.data.status === "COMPLETED") {
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

  const { dropReason } = parsed.data;
  const outcome = await db.$transaction(async (tx): Promise<SeatRefusal | { id: number; status: string }> => {
    const season = await readSeatSeason(tx, seasonId);
    if (!season) return { code: "not_found", message: "Enrollment not found." };
    if (isSeasonFinished(season)) return { code: "season_finished", message: "This season has finished." };
    // A draft's row is a plan: dropping would leave a "Did not finish" for a season they were never in.
    if (season.status === "DRAFT") {
      return { code: "season_draft", message: "This season hasn't started. Remove them from it instead." };
    }
    await lockPeople(tx, [id]);

    const where = { studentUserId: id, seasonId };
    // Conditional, so a row that moved on since it was last read is never overwritten.
    const [row] = await tx.seasonEnrollment.updateManyAndReturn({
      where: { ...where, status: "ACTIVE" },
      data: { status: "WITHDRAWN", droppedAt: new Date(), dropReason: dropReason ?? null },
      select: { id: true, status: true },
    });
    if (!row) {
      const exists = await tx.seasonEnrollment.count({ where });
      // R49: only an active row can be dropped; a restore is the one way back (R50).
      return exists > 0
        ? { code: "not_active", message: "Only an active enrollment can be dropped." }
        : { code: "not_found", message: "Enrollment not found." };
    }
    // The student's derived current season may have just changed.
    await markSessionsStale(tx, [id]);
    return row;
  });
  if ("code" in outcome) return apiError(res, outcome.code, outcome.message, refusalStatus(outcome));
  auditLog("enrollment.drop", user.userId, id);
  return apiOk(res, outcome);
}

/**
 * `POST /students/:id/enrollments/:seasonId/restore`: SUPER only. A seat write,
 * so it holds the season's share lock, then the person's, as adding does.
 */
export async function restoreEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  if (!isSuper(user)) return apiError(res, "forbidden", "Only a super admin can bring a student back.", 403);
  const id = parseId(req.params.id);
  const seasonId = parseId(req.params.seasonId);
  if (id === null || seasonId === null) {
    return apiError(res, "bad_request", "Invalid student or season id.", 400);
  }
  const parsed = restoreEnrollmentRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) return apiError(res, "bad_request", "Invalid restore body.", 400);

  const outcome = await db.$transaction(async (tx) => {
    const season = await readSeatSeason(tx, seasonId);
    if (!season) return { code: "not_found", message: "Season not found." };
    if (isSeasonFinished(season)) return { code: "season_finished", message: "This season has finished." };
    return restoreStudentSeat(tx, season, id, { id: user.userId, override: parsed.data.override ?? false });
  });
  if ("code" in outcome) return apiError(res, outcome.code, outcome.message, refusalStatus(outcome));

  auditLog("enrollment.restore", user.userId, id, { season: seasonId });
  return apiOk(res, { id: outcome.id, status: outcome.status });
}
