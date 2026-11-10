import type { Prisma } from "../../generated/prisma/client";
import { finishedSeasonStatus } from "../seasons/status";
import { liveSeason, liveUser } from "../db/live";

/**
 * The season a season normally follows, for "the people who passed it join
 * this one" (owner, 2026-11-07): the last finished (COMPLETED or ARCHIVED, not
 * deleted) season of the program it requires, else of its own program; latest
 * end date first, then the newest id. Null for a community-wide season, or when
 * that program has never finished a season. Only the suggested choice: the
 * picker lets the admin pick any finished season.
 */
export async function findPreviousSeasonId(
  tx: Prisma.TransactionClient,
  season: { id: number; program: string; requiredProgram: string | null; isCommunityWide: boolean },
): Promise<number | null> {
  if (season.isCommunityWide) return null;
  const row = await tx.season.findFirst({
    where: {
      id: { not: season.id },
      program: season.requiredProgram ?? season.program,
      status: finishedSeasonStatus,
      ...liveSeason,
    },
    orderBy: [{ endDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return row?.id ?? null;
}

export type SourceSeason = { id: number; code: string; title: string; passed: number; graduated: number };

/**
 * The finished seasons whose passers could be brought into this one, newest
 * end first: each with how many passers the picker lists (`passed`, from the
 * caller's own rows) and how many it can't because they are alumni now and the
 * season is a regular one (`graduated`). Seasons with neither are left out.
 */
export async function listSourceSeasons(
  tx: Prisma.TransactionClient,
  seasonId: number,
  listedPassers: Map<number, number>,
  listedIds: number[],
): Promise<SourceSeason[]> {
  const seasons = await tx.season.findMany({
    where: { id: { not: seasonId }, status: finishedSeasonStatus, ...liveSeason },
    orderBy: [{ endDate: "desc" }, { id: "desc" }],
    select: { id: true, code: true, title: true },
  });
  if (seasons.length === 0) return [];
  const unlisted = await tx.seasonEnrollment.groupBy({
    by: ["seasonId"],
    where: {
      seasonId: { in: seasons.map((s) => s.id) },
      status: "COMPLETED",
      result: "PASSED",
      studentUserId: { notIn: listedIds },
      studentUser: { ...liveUser, role: "STUDENT", graduationYear: { not: null } },
    },
    _count: { _all: true },
  });
  const graduatedBy = new Map(unlisted.map((g) => [g.seasonId, g._count._all]));
  return seasons
    .map((s) => ({ ...s, passed: listedPassers.get(s.id) ?? 0, graduated: graduatedBy.get(s.id) ?? 0 }))
    .filter((s) => s.passed + s.graduated > 0);
}
