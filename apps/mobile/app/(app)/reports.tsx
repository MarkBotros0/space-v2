import { useState } from "react";
import { View } from "react-native";

import { ExportMenu } from "../../src/screens/reports/export-menu";
import { Screen } from "../../src/design/layout/screen";
import { EmptyState, SegmentedControl } from "../../src/design/ui";
import { OrganisationSection } from "../../src/screens/reports/organisation-section";
import { SeasonReport } from "../../src/screens/reports/season-report";
import { useReportsScope } from "../../src/screens/reports/use-reports-scope";
import { useSessionStore, useRole } from "../../src/store/session";

function StaffReports() {
  const role = useRole();
  const seasonAdminIds = useSessionStore((s) => s.scopes?.seasonAdminIds);
  const [tab, setTab] = useState<"season" | "organisation">("season");

  // LEADER and STUDENT have no surface in this domain (R109, R110) and the API
  // refuses them explicitly. Nor does a MENTOR any more (owner, 2026-11-07: a
  // mentor sees nothing season-shaped; Follow-ups took the tab).
  const canView = role === "SUPER" || role === "ADMIN";
  const isSuper = role === "SUPER";
  const scope = useReportsScope(canView);
  const { seasonId, ready, summary, refresh, refreshing } = scope;

  if (!canView) {
    return (
      <Screen>
        <EmptyState title="Reports" description="This screen is for season admins." />
      </Screen>
    );
  }

  const showingOrganisation = isSuper && tab === "organisation";
  return (
    <Screen
      title="Reports"
      trailing={
        summary.data && ready && !showingOrganisation ? (
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
        {/* SUPER also reads the whole organisation: its own view, not a block above the season. */}
        {isSuper ? (
          <SegmentedControl
            options={[
              { value: "season", label: "Season" },
              { value: "organisation", label: "Organisation" },
            ]}
            value={tab}
            onChange={(v) => setTab(v as "season" | "organisation")}
          />
        ) : null}
        {showingOrganisation ? (
          <OrganisationSection />
        ) : (
          <SeasonReport
            scope={scope}
            allowAll={isSuper}
            // A finished season in an admin's History: its student pages aren't theirs any more.
            canOpenStudent={(row) => isSuper || (seasonAdminIds ?? []).includes(row.seasonId)}
          />
        )}
      </View>
    </Screen>
  );
}

// Mentors get their own grouped page; every other role keeps the staff screen.
export default function ReportsScreen() {
  return <StaffReports />;
}
