import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError, toApiError } from "../api-error";
import { markSessionsStale } from "../auth/session-validity";
import { lockPeople, readSeatSeason, seatStudents, type SeatRefusal, type SeatStudentsResult } from "../roles";
import { isSeasonFinished } from "../seasons/status";
import { deleteDraftRow, hasWorkInSeason } from "../students/graduation";

export const SEASON_NOT_FOUND: SeatRefusal = { code: "not_found", message: "Season not found." };
export const NOT_DRAFT: SeatRefusal = { code: "not_draft", message: "This season has already started." };
const NOT_ON_ROSTER: SeatRefusal = { code: "not_found", message: "That person isn't in this season." };

/** `"Mina is already leading a group in GBV 2026, and 2 others can't join."` */
function batchMessage(refused: SeatStudentsResult["refused"]): string {
  const first = refused[0]!.refusal.message;
  const rest = refused.length - 1;
  if (rest === 0) return first;
  return `${first.replace(/\.$/, "")}, and ${rest} ${rest === 1 ? "other" : "others"} can't join.`;
}

/**
 * `POST /seasons/:id/enrollments`' write: all or nothing, because a
 * half-applied batch can't be read by the operator. seatStudents writes nothing
 * when anyone is refused, so every refusal here leaves the season untouched.
 */
export async function addSeasonPeople(
  seasonId: number,
  actorId: number,
  userIds: number[],
  overrideUserIds: number[],
): Promise<SeatStudentsResult> {
  const outcome = await db.$transaction(
    async (tx): Promise<SeatRefusal | SeatStudentsResult> => {
      const season = await readSeatSeason(tx, seasonId);
      if (!season) return SEASON_NOT_FOUND;
      if (isSeasonFinished(season.status)) return { code: "season_finished", message: "This season has finished." };
      return seatStudents(tx, season, userIds, {
        override: { userIds: overrideUserIds, actorId, actorMayOverride: true },
      });
    },
    // The statements are flat, but each reads or writes up to 500 people's rows.
    { timeout: 30_000 },
  );
  if ("code" in outcome) throw toApiError(outcome);
  if (outcome.refused.some((r) => r.refusal.code === "not_found")) {
    throw new ApiError("not_found", "User not found.", 404);
  }
  if (outcome.refused.length > 0) {
    throw new ApiError("people_unavailable", batchMessage(outcome.refused), 409);
  }
  return outcome;
}

/** A person's row in a draft, under the same locks as a seat write: the season, then the person. */
async function draftRow(
  tx: Prisma.TransactionClient,
  seasonId: number,
  userId: number,
): Promise<{ id: number; status: string }> {
  const season = await readSeatSeason(tx, seasonId);
  if (!season) throw toApiError(SEASON_NOT_FOUND);
  if (season.status !== "DRAFT") throw toApiError(NOT_DRAFT);
  await lockPeople(tx, [userId]);
  const row = await tx.seasonEnrollment.findUnique({
    where: { studentUserId_seasonId: { studentUserId: userId, seasonId } },
    select: { id: true, status: true },
  });
  if (!row) throw toApiError(NOT_ON_ROSTER);
  return row;
}

/**
 * `DELETE /seasons/:id/enrollments/:userId`'s write: a draft's row is a plan,
 * not history, so it goes entirely, unless the person has already done work.
 * Every refusal is thrown before anything is written.
 */
export async function removeFromDraft(seasonId: number, userId: number): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await draftRow(tx, seasonId, userId);
    // Removing a dropped row and adding them again would skip the super-only way back.
    if (row.status !== "ACTIVE") {
      throw new ApiError("not_active", "Only someone active in the season can be removed.", 409);
    }
    // Refused, not deleted along with the row: a record left behind couldn't be
    // cleared once they're off the roster, and re-adding them would revive it.
    if (await hasWorkInSeason(tx, userId, seasonId)) {
      throw new ApiError("has_work", "This person already has work or attendance recorded in this season.", 409);
    }
    await deleteDraftRow(tx, { id: row.id, seasonId, studentUserId: userId });
    await markSessionsStale(tx, [userId]);
  });
}

/** `POST /seasons/:id/enrollments/:userId/override`'s write: lets someone on a draft's roster past a block. */
export async function overrideOnDraft(
  seasonId: number,
  userId: number,
  actorId: number,
): Promise<{ overrideById: number | null; overrideAt: Date | null }> {
  return db.$transaction(async (tx) => {
    const row = await draftRow(tx, seasonId, userId);
    // A dropped row isn't on the roster.
    if (row.status !== "ACTIVE") throw toApiError(NOT_ON_ROSTER);
    return tx.seasonEnrollment.update({
      where: { id: row.id },
      data: { overrideById: actorId, overrideAt: new Date() },
      select: { overrideById: true, overrideAt: true },
    });
  });
}
