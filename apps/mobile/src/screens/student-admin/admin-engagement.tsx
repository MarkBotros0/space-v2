/** Engagement tiles for the current season; a 404 no_season shows nothing (v1). Same shape as plan 03's leader page. */
import { View } from "react-native";

import { isNoSeasonError, useStudentEngagement } from "../../hooks/use-engagement";
import { InlineError } from "../../design/layout/route-states";
import { StatTile } from "../../design/ui/stat-tile";
import { StatusChip } from "../../design/ui/status-chip";

export function AdminEngagement({ studentId }: { studentId: number }) {
  const q = useStudentEngagement(studentId, true);
  if (q.isPending || (q.isError && isNoSeasonError(q.error))) return null;
  if (q.isError)
    return <InlineError message="Couldn't load engagement." onRetry={() => void q.refetch()} />;
  const e = q.data;
  return (
    <View className="flex-col gap-3">
      {/* V2-ONLY: the single at-risk definition (C4). */}
      {e.atRisk ? <StatusChip tone="bad" label="At risk" /> : null}
      <View className="flex-row flex-wrap gap-3">
        <StatTile value={e.score} suffix="%" label="Score" />
        <StatTile
          value={e.attendancePct}
          suffix="%"
          label={`Attendance ${e.attendancePresent}/${e.attendanceTotal}`}
        />
        <StatTile
          value={e.submissionPct}
          suffix="%"
          label={`Submissions ${e.submissionsCompleted}/${e.submissionsExpected}`}
        />
      </View>
    </View>
  );
}
