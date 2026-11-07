/**
 * The engagement report under its season header: what Reports shows for one
 * season (or, for SUPER and MENTOR, all of them). Shared by the staff and
 * mentor screens; the scope comes from `useReportsScope`.
 */
import { View } from "react-native";
import type { EngagementReportRow } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { EmptyState, Text } from "../../design/ui";
import { EngagementCards } from "./engagement-cards";
import { ReportSeasonHeader } from "./report-season-header";
import type { useReportsScope } from "./use-reports-scope";

export function SeasonReport({
  scope,
  allowAll,
  canOpenStudent,
}: {
  scope: ReturnType<typeof useReportsScope>;
  allowAll: boolean;
  canOpenStudent?: (row: EngagementReportRow) => boolean;
}) {
  const { seasonId, setSeasonId, ready, permitted, summary, atRiskRows, moreFailed, showMore } =
    scope;

  if (summary.isError && !summary.data)
    return <RouteError onRetry={() => void summary.refetch()} />;
  if (!ready || summary.isPending) return <RouteSkeleton />;
  if (permitted.length === 0) {
    return (
      <EmptyState
        title="No seasons yet"
        description="Reports appear once you run a season and its first session has taken place."
      />
    );
  }
  const data = summary.data;
  return (
    <View className="flex-col gap-4">
      {/* Outside the error branch: a season that keeps failing must not strand the caller. */}
      <ReportSeasonHeader
        seasons={permitted}
        selected={seasonId}
        onSelect={setSeasonId}
        allowAll={allowAll}
      />
      {summary.isError ? (
        <RouteError onRetry={() => void summary.refetch()} />
      ) : data ? (
        <>
          {data.scope.truncated ? (
            <Text variant="caption" className="text-warn">
              Some seasons you asked for aren&apos;t in your scope.
            </Text>
          ) : null}
          {data.enrollmentCount === 0 && data.attendanceTrend.length === 0 ? (
            <EmptyState
              title="Nothing to report yet"
              description="Numbers appear once students are enrolled and the first session has run. Pick another season from History."
            />
          ) : (
            <EngagementCards
              summary={data}
              atRiskRows={atRiskRows}
              onShowMore={showMore}
              moreFailed={moreFailed}
              canOpenStudent={canOpenStudent}
            />
          )}
        </>
      ) : null}
    </View>
  );
}
