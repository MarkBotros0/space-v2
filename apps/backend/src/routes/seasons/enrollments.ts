import type { Request, Response } from "express";

import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { apiOk, apiError } from "../../lib/api-response";
import { auditLog } from "../../lib/audit";
import { markSessionsStale } from "../../lib/auth/session-validity";
import { parseId } from "../../lib/parse-id";
import { deleteDraftRow, hasWorkInSeason } from "../../lib/queries/students/writes";
import { isAdminOfSeason } from "../../lib/rbac";
import { lockPeople, readSeatSeason, seatStudents, type SeatRefusal, type SeatStudentsResult } from "../../lib/roles";
import { refusalStatus } from "../../lib/api-error";
import { requireUser } from "../../middleware/require-auth";
// Value import: relative path is mandatory here (CLAUDE.md's rootDir emit trap).
import { addSeasonEnrollmentsRequestSchema } from "../../../../../packages/shared/src/index";
import { forbidden } from "../respond";
import { isSeasonFinished } from "../../lib/seasons/status";

export const SEASON_NOT_FOUND: SeatRefusal = { code: "not_found", message: "Season not found." };
export const NOT_DRAFT: SeatRefusal = { code: "not_draft", message: "This season has already started." };

function refuse(res: Response, refusal: SeatRefusal) {
  return apiError(res, refusal.code, refusal.message, refusalStatus(refusal));
}

/** `"Mina is already leading a group in GBV 2026, and 2 others can't join."` */
function batchMessage(refused: SeatStudentsResult["refused"]): string {
  const first = refused[0]!.refusal.message;
  const rest = refused.length - 1;
  if (rest === 0) return first;
  return `${first.replace(/\.$/, "")}, and ${rest} ${rest === 1 ? "other" : "others"} can't join.`;
}

/**
 * `POST /seasons/:id/enrollments`: SUPER, or that season's admin. All or
 * nothing, because a half-applied batch can't be read by the operator.
 */
export async function addSeasonEnrollments(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  if (seasonId === null) return apiError(res, "bad_request", "Invalid season id.", 400);
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const parsed = addSeasonEnrollmentsRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid enrollment body.", 400);
  // Whoever administers the season may let someone past a block (owner, 2026-11-07).
  const { userIds, overrideUserIds = [] } = parsed.data;

  const outcome = await db.$transaction(
    async (tx): Promise<SeatRefusal | SeatStudentsResult> => {
      const season = await readSeatSeason(tx, seasonId);
      if (!season) return SEASON_NOT_FOUND;
      if (isSeasonFinished(season.status)) return { code: "season_finished", message: "This season has finished." };
      return seatStudents(tx, season, userIds, {
        override: { userIds: overrideUserIds, actorId: user.userId, actorMayOverride: true },
      });
    },
    // The statements are flat, but each reads or writes up to 500 people's rows.
    { timeout: 30_000 },
  );

  if ("code" in outcome) return refuse(res, outcome);
  if (outcome.refused.some((r) => r.refusal.code === "not_found")) {
    return apiError(res, "not_found", "User not found.", 404);
  }
  if (outcome.refused.length > 0) {
    return apiError(res, "people_unavailable", batchMessage(outcome.refused), 409);
  }
  for (const id of outcome.seated) auditLog("enrollment.add", user.userId, id, { season: seasonId });
  for (const id of outcome.overridden) auditLog("enrollment.override", user.userId, id, { season: seasonId });
  return apiOk(res, { added: outcome.seated.length }, 201);
}

/** A person's row in a draft, under the same locks as a seat write: the season, then the person. */
async function draftRow(
  tx: Prisma.TransactionClient,
  seasonId: number,
  userId: number,
): Promise<SeatRefusal | { id: number; status: string } | null> {
  const season = await readSeatSeason(tx, seasonId);
  if (!season) return SEASON_NOT_FOUND;
  if (season.status !== "DRAFT") return NOT_DRAFT;
  await lockPeople(tx, [userId]);
  return tx.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: userId, seasonId } },
    select: { id: true, status: true },
  });
}

const NOT_ON_ROSTER: SeatRefusal = { code: "not_found", message: "That person isn't in this season." };

/**
 * `DELETE /seasons/:id/enrollments/:userId`: a draft's row is a plan, not
 * history, so it goes entirely, unless the person has already done work.
 */
export async function removeSeasonEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (seasonId === null || userId === null) {
    return apiError(res, "bad_request", "Invalid season or user id.", 400);
  }
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const refusal = await db.$transaction(async (tx): Promise<SeatRefusal | null> => {
    const row = await draftRow(tx, seasonId, userId);
    if (!row) return NOT_ON_ROSTER;
    if ("code" in row) return row;
    // Removing a dropped row and adding them again would skip the super-only way back.
    if (row.status !== "ACTIVE") {
      return { code: "not_active", message: "Only someone active in the season can be removed." };
    }

    // Refused, not deleted along with the row: a record left behind couldn't be
    // cleared once they're off the roster, and re-adding them would revive it.
    if (await hasWorkInSeason(tx, userId, seasonId)) {
      return { code: "has_work", message: "This person already has work or attendance recorded in this season." };
    }

    await deleteDraftRow(tx, { id: row.id, seasonId, studentUserId: userId });
    await markSessionsStale(tx, [userId]);
    return null;
  });
  if (refusal) return refuse(res, refusal);

  auditLog("enrollment.remove", user.userId, userId, { season: seasonId });
  return apiOk(res, { removed: true });
}

/**
 * `POST /seasons/:id/enrollments/:userId/override`: SUPER, or that season's
 * admin (owner, 2026-11-07). Lets someone
 * already on a draft's roster past a block, for Start's checklist.
 */
export async function overrideSeasonEnrollment(req: Request, res: Response) {
  const user = requireUser(req);
  const seasonId = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  if (seasonId === null || userId === null) {
    return apiError(res, "bad_request", "Invalid season or user id.", 400);
  }
  if (!isAdminOfSeason(user, seasonId)) return forbidden(res);

  const outcome = await db.$transaction(async (tx) => {
    const row = await draftRow(tx, seasonId, userId);
    if (!row) return NOT_ON_ROSTER;
    if ("code" in row) return row;
    // A dropped row isn't on the roster.
    if (row.status !== "ACTIVE") return NOT_ON_ROSTER;
    return tx.seasonEnrollment.update({
      where: { id: row.id },
      data: { overrideById: user.userId, overrideAt: new Date() },
      select: { overrideById: true, overrideAt: true },
    });
  });
  if ("code" in outcome) return refuse(res, outcome);

  auditLog("enrollment.override", user.userId, userId, { season: seasonId });
  return apiOk(res, outcome);
}
