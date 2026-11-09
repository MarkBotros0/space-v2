/**
 * The community-wide rule: such a season runs alone. A violation, so it blocks
 * `--apply`. Reads `isCommunityWide`, a column an unmigrated database lacks.
 */
import { db } from "../src/db/client";

/** One row per ACTIVE community-wide season that has company. */
export interface CommunityWideNotAlone {
  seasonId: number;
  otherActiveSeasons: number;
}

/** Prisma's "column does not exist": the migration that added the flag hasn't reached this database. */
function isMissingColumn(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2022";
}

/** The rows, or null when the database has no `isCommunityWide` column yet (unknown, not clean). */
export async function findCommunityWideNotAlone(): Promise<CommunityWideNotAlone[] | null> {
  try {
    const active = await db.season.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, isCommunityWide: true },
    });
    return active
      .filter((s) => s.isCommunityWide && active.length > 1)
      .map((s) => ({ seasonId: s.id, otherActiveSeasons: active.length - 1 }));
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    return null;
  }
}
