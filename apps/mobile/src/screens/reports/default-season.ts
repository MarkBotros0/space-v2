import { isSeasonFinished, isSeasonLive } from "@space/shared";
import type { ResolvedScope } from "@space/shared";

export type ReportSeason = ResolvedScope["seasons"][number];

/**
 * The season Reports opens on (owner, 2026-11-07): the season running now,
 * else the one that ended last. A draft has no data yet, so it is never the
 * default. Null when there is nothing to show.
 */
export function defaultReportSeason(seasons: ReportSeason[]): number | null {
  const active = seasons.find((s) => s.status === "ACTIVE");
  if (active) return active.id;
  const finished = seasons.filter((s) => isSeasonFinished(s.status)).sort((a, b) => b.endDate.localeCompare(a.endDate));
  return finished[0]?.id ?? seasons[0]?.id ?? null;
}

/** Running or about to: listed above History's past seasons. */
export const isCurrentSeason = (s: Pick<ReportSeason, "status">) => isSeasonLive(s.status);
