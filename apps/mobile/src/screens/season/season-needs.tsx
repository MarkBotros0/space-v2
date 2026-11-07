import { RouteSkeleton } from "../../design/layout/route-states";
import { useSeasonNeeds } from "../../hooks/use-season-needs";
import { NeedsActionList } from "../staff-today/needs-action-list";

/**
 * A running season's Needs attention tiles on its page (owner, 2026-11-07):
 * submissions to review, sessions without attendance, students at risk, each
 * opening its list narrowed to this season. Where Super finds the work that
 * left their Home; the season's admin sees the same tiles here as on theirs.
 */
export function SeasonNeeds({ seasonId }: { seasonId: number }) {
  const { needs, isPending, refetch } = useSeasonNeeds(seasonId);
  if (isPending) return <RouteSkeleton />;
  return (
    <NeedsActionList
      title="Needs attention"
      needs={needs}
      scopeSeasonId={seasonId}
      onRetry={refetch}
    />
  );
}
