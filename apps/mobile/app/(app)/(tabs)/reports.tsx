import { View } from "react-native";

import { ExportMenu } from "../../../src/components/ExportMenu";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState, Text } from "../../../src/design/ui";
import { EngagementCards } from "../../../src/screens/reports/engagement-cards";
import { OrganisationSection } from "../../../src/screens/reports/organisation-section";
import { scopeLine } from "../../../src/screens/reports/scope-line";
import { SeasonPicker } from "../../../src/screens/reports/season-picker";
import { useReportsScope } from "../../../src/screens/reports/use-reports-scope";
import { MentorReports } from "../../../src/screens/mentor/mentor-reports";
import { useSessionStore } from "../../../src/store/session";

function StaffReports() {
  const role = useSessionStore((s) => s.user?.role ?? null);

  // LEADER and STUDENT have no surface in this domain (R109, R110) and the API
  // refuses them explicitly. The screen does not ask. MENTOR is routed away below.
  const canView = role === "SUPER" || role === "ADMIN";
  const isSuper = role === "SUPER";

  const { seasonId, setSeasonId, permitted, summary, atRiskRows, showMore, refresh, refreshing } =
    useReportsScope(canView);

  if (!canView) {
    return (
      <Screen>
        <EmptyState title="Reports" description="This screen is for mentors and season admins." />
      </Screen>
    );
  }

  return (
    <Screen
      title="Reports"
      subtitle={summary.data ? scopeLine(seasonId, summary.data.scope) : undefined}
      trailing={
        summary.data ? (
          <ExportMenu
            sheet
            seasonId={seasonId}
            scopeLabel={summary.data.scope.label}
            canExportWorkbook={seasonId !== null}
            exportDay={summary.data.exportDay}
          />
        ) : undefined
      }
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
            {isSuper ? <OrganisationSection /> : null}

            <SeasonPicker seasons={permitted} selected={seasonId} onSelect={setSeasonId} />

            {summary.data.scope.truncated ? (
              <Text className="text-xs text-warning-700 dark:text-warning-300">
                Some seasons you asked for aren&apos;t in your scope.
              </Text>
            ) : null}

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
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

// Mentors get their own grouped page; every other role keeps the staff screen.
export default function ReportsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  return role === "MENTOR" ? <MentorReports /> : <StaffReports />;
}
