import { useEffect, useState } from "react";
import { View } from "react-native";

import { ExportMenu } from "../../../src/components/ExportMenu";
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { EmptyState, Text } from "../../../src/design/ui";
import { useEngagementReport, useEngagementStudents } from "../../../src/hooks/use-reports";
import { EngagementCards } from "../../../src/screens/reports/engagement-cards";
import { OrganisationSection } from "../../../src/screens/reports/organisation-section";
import { SeasonPicker } from "../../../src/screens/reports/season-picker";
import { MentorReports } from "../../../src/screens/mentor/mentor-reports";
import { useSessionStore } from "../../../src/store/session";

function StaffReports() {
  const role = useSessionStore((s) => s.user?.role ?? null);

  // LEADER and STUDENT have no surface in this domain (R109, R110) and the API
  // refuses them explicitly. The screen does not ask.
  const canView = role === "SUPER" || role === "ADMIN" || role === "MENTOR";
  const isSuper = role === "SUPER";

  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);

  const summary = useEngagementReport(seasonId, canView);
  const more = useEngagementStudents(seasonId, "AT_RISK", canView && showAllAtRisk);

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

  if (!canView) {
    return (
      <ShellFrame>
        <EmptyState title="Reports" description="This screen is for mentors and season admins." />
      </ShellFrame>
    );
  }

  const handleRefresh = () => {
    void summary.refetch();
  };

  const extraRows = more.data?.pages.flatMap((p) => p.rows) ?? [];
  const atRiskRows =
    showAllAtRisk && extraRows.length > 0 ? extraRows : (summary.data?.atRisk ?? []);

  return (
    <ShellFrame onRefresh={handleRefresh} refreshing={summary.isRefetching}>
      <View className="flex-col gap-4">
        <PageTitle
          title="Reports"
          subtitle={summary.data ? `Scoped to ${summary.data.scope.label}.` : undefined}
        />

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

            <ExportMenu
              seasonId={seasonId}
              scopeLabel={summary.data.scope.label}
              canExportWorkbook={seasonId !== null && (role === "SUPER" || role === "ADMIN")}
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
    </ShellFrame>
  );
}

// Mentors get their own frame (plan 05); every other role keeps the staff screen.
export default function ReportsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  return role === "MENTOR" ? <MentorReports /> : <StaffReports />;
}
