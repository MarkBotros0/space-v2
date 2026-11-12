import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { lockSeason } from "../roles";
import { isSeasonFinished } from "./status";

/**
 * The first lock of a staff write that changes a score (an attendance save, a paper grade): the
 * Season FOR SHARE, as a staff mark and the admin's score take it. End holds it FOR NO KEY UPDATE,
 * so the write lands wholly before End (whose recompute then sees it) or waits for End and reads
 * the season finished. A finished season stays writable for a super, as it always was
 * (`mayWriteFinished`); anyone else's grants ended with the season, so they get the 403 their next
 * request would get, and nothing is written.
 */
export async function lockSeasonForStaffWrite(
  tx: Prisma.TransactionClient,
  seasonId: number,
  mayWriteFinished: boolean,
): Promise<void> {
  await lockSeason(tx, seasonId, "share");
  if (mayWriteFinished) return;
  const season = await tx.season.findUnique({ where: { id: seasonId }, select: { status: true } });
  if (season && isSeasonFinished(season.status)) {
    throw new ApiError("forbidden", "You don't have access to this.", 403);
  }
}
