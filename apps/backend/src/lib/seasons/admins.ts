import { db } from "../../db/client";
import { ApiError, toApiError } from "../api-error";
import { markSessionsStale } from "../auth/session-validity";
import { isUniqueViolation } from "../prisma-errors";
import { lockPeople, readSeatSeason, refuseNewSeats } from "../roles";

/**
 * Seats a season admin (POST /seasons/:id/admins). Who can take the seat is
 * `lib/roles`: alumni only, and no other active role; a refusal is an ApiError
 * thrown before the write. Idempotent: an existing row, or one a concurrent
 * request just added (the unique violation), is "exists". The person's
 * sessions go stale, so their next refresh re-reads `seasonAdminIds`.
 */
export async function seatSeasonAdmin(
  seasonId: number,
  userId: number,
  actorId: number,
): Promise<"created" | "exists"> {
  try {
    return await db.$transaction(async (tx) => {
      const season = await readSeatSeason(tx, seasonId);
      if (!season) throw new ApiError("not_found", "Season not found.", 404);
      await lockPeople(tx, [userId]);
      const existing = await tx.seasonAdmin.findUnique({
        where: { seasonId_userId: { seasonId, userId } },
        select: { userId: true },
      });
      if (existing) return "exists" as const;

      const refusal = await refuseNewSeats(tx, [userId], { kind: "admin", season });
      if (refusal) throw toApiError(refusal);

      await tx.seasonAdmin.create({ data: { seasonId, userId, assignedById: actorId } });
      await markSessionsStale(tx, [userId]);
      return "created" as const;
    });
  } catch (err) {
    // The race the pre-read can lose: someone else just added the same row.
    if (!isUniqueViolation(err)) throw err;
    return "exists";
  }
}

/**
 * Removes a season admin. No role or activation check: removing a stale row (a
 * deactivated admin's, say) is exactly the clean-up the route exists for.
 * Returns whether a row went.
 */
export async function unseatSeasonAdmin(seasonId: number, userId: number): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.seasonAdmin.deleteMany({ where: { seasonId, userId } });
    if (count > 0) await markSessionsStale(tx, [userId]);
    return count > 0;
  });
}
