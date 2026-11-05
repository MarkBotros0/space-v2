import { View } from "react-native";

import { ExportMenu } from "../../components/ExportMenu";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, Text } from "../../design/ui";
import { EngagementCards } from "../reports/engagement-cards";
import { SeasonPicker } from "../reports/season-picker";
import { useReportsScope } from "../reports/use-reports-scope";

/**
 * The mentor's Reports: the engagement view only. Never the organisation
 * roll-up and never the workbook export (those are admin/super, plan 04).
 */
export function MentorReports() {
  const { seasonId, setSeasonId, permitted, summary, atRiskRows, moreFailed, showMore, refresh, refreshing } =
    useReportsScope(true);

  return (
    <Screen
      title="Reports"
      subtitle={summary.data ? `Scoped to ${summary.data.scope.label}.` : undefined}
      onRefresh={refresh}
      refreshing={refreshing}
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
                onShowMore={showMore}
                moreFailed={moreFailed}
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
