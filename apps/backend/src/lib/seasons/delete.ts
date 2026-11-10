import { db } from "../../db/client";
import { ApiError } from "../api-error";
import { seasonPeopleIds } from "../auth/season-people";
import { markSessionsStale } from "../auth/session-validity";
import { liveSeason } from "../db/live";
import { lockPeople, lockSeason } from "../roles";

/**
 * DELETE /seasons/:id's transaction (see the route for the rule). The check and
 * the delete share the season's lock, so a seat going in lands wholly before the
 * check or finds the season gone. Both refusals are thrown before any write.
 */
export async function deleteSeasonNow(id: number, actorId: number): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockSeason(tx, id, "update");
    const existing = await tx.season.findFirst({ where: { id, ...liveSeason }, select: { id: true } });
    if (!existing) throw new ApiError("not_found", "Season not found.", 404);
    const enrollments = await tx.seasonEnrollment.count({ where: { seasonId: id } });
    const sessions = await tx.session.count({ where: { seasonId: id } });
    if (enrollments > 0 || sessions > 0) {
      throw new ApiError("season_in_use", "This season has sessions or enrollments; archive it instead.", 409);
    }

    // The current season is derived from live seasons, so a deleted one drops
    // out of every scope on its own; its staff's next refresh picks that up now.
    const people = await seasonPeopleIds(tx, id);
    await lockPeople(tx, people);
    await tx.season.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actorId } });
    await markSessionsStale(tx, people);
  });
}
