import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SeasonProgress, StudentDashboard } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { GroupedList, ListRow, StatTile } from "../../design/ui";
import type { useMyAttendance } from "../../hooks/use-self-service";
import { WORK_HREF } from "../work/work-model";

const NO_VALUE = "—";

function seasonLine(progress: SeasonProgress | null): string | undefined {
  if (progress === null) return undefined;
  const { pct, sessionsHeld: held, sessionsTotal: total } = progress;
  if (pct === null) return "No sessions scheduled yet";
  if (pct >= 100) return `Session ${held} of ${total} · complete`;
  const left = total - held;
  return `${left} ${left === 1 ? "session" : "sessions"} to go · ${pct}% done`;
}

/**
 * P2-6: a 2×2 tile grid, then the season row. The attendance tiles come from
 * their own query (spec 19 §7, D14), so when it fails only those two step aside.
 */
export function TodayFigures({
  data,
  attendance,
}: {
  data: StudentDashboard;
  attendance: ReturnType<typeof useMyAttendance>;
}) {
  const router = useRouter();
  const { progress, season } = data;
  const budget = attendance.data?.budget;
  const streak = attendance.data?.streak ?? null;

  return (
    <View className="gap-3">
      {attendance.isError ? (
        <InlineError
          message="Couldn't load your attendance."
          onRetry={() => void attendance.refetch()}
        />
      ) : null}
      <View className="flex-row flex-wrap gap-3">
        {attendance.isError ? null : (
          <>
            <StatTile
              label="Absence budget left"
              value={budget ? `${budget.remainingPct}%` : NO_VALUE}
              onPress={() => router.push("/attendance")}
            />
            <StatTile label="Streak" value={streak ?? NO_VALUE} />
          </>
        )}
        <StatTile
          label="Assignments pending"
          value={data.assignments?.outstandingCount ?? 0}
          onPress={() => router.push(WORK_HREF)}
        />
        <StatTile
          label="Sessions done"
          value={progress ? `${progress.sessionsHeld}/${progress.sessionsTotal}` : NO_VALUE}
        />
      </View>
      {season ? (
        <GroupedList>
          <ListRow
            title={season.title}
            subtitle={seasonLine(progress)}
            titleLines={2}
            chevron
            onPress={() => router.push("/season")}
          />
        </GroupedList>
      ) : null}
    </View>
  );
}
