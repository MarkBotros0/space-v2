import { useEffect, useState } from "react";
import { View } from "react-native";

import { ExportMenu } from "../../components/ExportMenu";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, Text } from "../../design/ui";
import { useEngagementReport, useEngagementStudents } from "../../hooks/use-reports";
import { EngagementCards } from "../reports/engagement-cards";
import { SeasonPicker } from "../reports/season-picker";

/**
 * The mentor's Reports: the engagement view only. Never the organisation
 * roll-up and never the workbook export (those are admin/super, plan 04).
 */
export function MentorReports() {
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);

  const summary = useEngagementReport(seasonId, true);
  const more = useEngagementStudents(seasonId, "AT_RISK", showAllAtRisk);

  // Picker options come from the first unscoped response's scope.
  const [permitted, setPermitted] = useState<Array<{ id: number; title: string }>>([]);
  useEffect(() => {
    if (seasonId === null && summary.data) {
      setPermitted(summary.data.scope.seasons.map((s) => ({ id: s.id, title: s.title })));
    }
  }, [seasonId, summary.data]);

  const extraRows = more.data?.pages.flatMap((p) => p.rows) ?? [];
  const atRiskRows =
    showAllAtRisk && extraRows.length > 0 ? extraRows : (summary.data?.atRisk ?? []);

  return (
    <Screen
      title="Reports"
      subtitle={summary.data ? `Scoped to ${summary.data.scope.label}.` : undefined}
      onRefresh={() => void summary.refetch()}
      refreshing={summary.isRefetching}
    >
      <View className="flex-col gap-4">
        {summary.isPending ? (
          <RouteSkeleton />
        ) : summary.isError ? (
          <RouteError onRetry={() => void summary.refetch()} />
        ) : (
          <>
            <SeasonPicker seasons={permitted} selected={seasonId} onSelect={setSeasonId} />

            {summary.data.scope.truncated ? (
              <Text className="text-xs text-warning-700 dark:text-warning-300">
                Some seasons you asked for aren&apos;t in your scope.
              </Text>
            ) : null}

            <ExportMenu
              seasonId={seasonId}
              scopeLabel={summary.data.scope.label}
              canExportWorkbook={false}
              exportDay={summary.data.exportDay}
            />

            {summary.data.enrollmentCount === 0 && summary.data.attendanceTrend.length === 0 ? (
              <EmptyState
                title="No data in this scope"
                description="Pick a season with activity, or wait until the first session has run."
              />
            ) : (
              <EngagementCards
                summary={summary.data}
                atRiskRows={atRiskRows}
                onShowMore={() => {
                  setShowAllAtRisk(true);
                  if (more.hasNextPage) void more.fetchNextPage();
                }}
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
