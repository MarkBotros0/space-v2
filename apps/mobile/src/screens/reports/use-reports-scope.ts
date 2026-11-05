import { useEffect, useState } from "react";

import { useEngagementReport, useEngagementStudents } from "../../hooks/use-reports";

/**
 * The Reports screens' shared season scope: the selected season, the seasons
 * this caller may pick, and the at-risk rows with their Show-more paging.
 * `enabled` is the role gate: the API refuses a role with no surface here, so
 * the screen does not ask.
 */
export function useReportsScope(enabled: boolean) {
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);

  const summary = useEngagementReport(seasonId, enabled);
  const more = useEngagementStudents(seasonId, "AT_RISK", enabled && showAllAtRisk);

  // The picker's options come from the FIRST unscoped response's scope, which
  // already lists exactly the seasons this caller is permitted. A separate
  // GET /api/v1/seasons would be a second round trip for data in hand.
  const [permitted, setPermitted] = useState<Array<{ id: number; title: string }>>([]);
  // useEffect, not useMemo: this sets state. A useMemo that calls a setter
  // renders-during-render and React 19 will warn (and in StrictMode run it
  // twice). The guard on `seasonId === null` is what keeps the option list from
  // collapsing to one entry after the user picks a season.
  useEffect(() => {
    if (seasonId === null && summary.data) {
      setPermitted(summary.data.scope.seasons.map((s) => ({ id: s.id, title: s.title })));
    }
  }, [seasonId, summary.data]);

  const extraRows = more.data?.pages.flatMap((p) => p.rows) ?? [];
  const atRiskRows =
    showAllAtRisk && extraRows.length > 0 ? extraRows : (summary.data?.atRisk ?? []);

  return {
    seasonId,
    setSeasonId,
    permitted,
    summary,
    atRiskRows,
    /**
     * Pull-to-refresh spinner: the summary or the opened at-risk rows are refetching.
     * Not while Show more loads a later page, which isRefetching alone would count.
     */
    refreshing: summary.isRefetching || (more.isRefetching && !more.isFetchingNextPage),
    showMore: () => {
      setShowAllAtRisk(true);
      // A failed first page leaves hasNextPage false: ask for it again.
      if (more.isError) void more.refetch();
      else if (more.hasNextPage) void more.fetchNextPage();
    },
    refresh: () => {
      void summary.refetch();
      // `enabled` gates only the automatic run: guard the manual one too.
      if (enabled && showAllAtRisk) void more.refetch();
    },
  };
}
