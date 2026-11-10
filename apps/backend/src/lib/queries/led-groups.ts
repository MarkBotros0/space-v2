import { db } from "../../db/client";
import type { SessionUser } from "../auth/tokens";

/**
 * The groups of this season that the caller leads, by id. Read from the
 * token's groupLeaderIds, so a group they were taken off since is still listed
 * until the next refresh, exactly as every caller did inline (refactor BE-027).
 */
export async function ledGroupIdsInSeason(user: SessionUser, seasonId: number): Promise<number[]> {
  const groups = await db.group.findMany({
    where: { seasonId, id: { in: user.groupLeaderIds } },
    select: { id: true },
  });
  return groups.map((g) => g.id);
}

/** The seasons of every group the caller leads, one entry per group (not deduplicated). */
export async function ledGroupSeasonIds(user: SessionUser): Promise<number[]> {
  if (user.groupLeaderIds.length === 0) return [];
  const groups = await db.group.findMany({
    where: { id: { in: user.groupLeaderIds } },
    select: { seasonId: true },
  });
  return groups.map((g) => g.seasonId);
}
