import { View } from "react-native";

import { ExportMenu } from "../../components/ExportMenu";
import { Screen } from "../../design/layout/screen";
import { SeasonReport } from "../reports/season-report";
import { useReportsScope } from "../reports/use-reports-scope";

/**
 * The mentor's Reports: the engagement view only, opening on the current
 * season with History for the rest (All seasons included). Never the
 * organisation roll-up and never the workbook export (those are admin/super,
 * plan 04).
 */
export function MentorReports() {
  const scope = useReportsScope(true);
  const { seasonId, ready, summary, refresh, refreshing } = scope;

  return (
    <Screen
      title="Reports"
      trailing={
        summary.data && ready ? (
          <ExportMenu
            sheet
            seasonId={seasonId}
            scopeLabel={summary.data.scope.label}
            canExportWorkbook={false}
            exportDay={summary.data.exportDay}
          />
        ) : undefined
      }
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <View className="flex-col gap-4">
        <SeasonReport scope={scope} allowAll />
      </View>
    </Screen>
  );
}
