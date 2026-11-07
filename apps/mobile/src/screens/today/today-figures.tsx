import { useRouter } from "expo-router";
import { View } from "react-native";
import type { StudentDashboard } from "@space/shared";

import { SeasonPulse, type PulseFigure } from "../../design/home/season-pulse";
import { InlineError } from "../../design/layout/route-states";
import type { useMyAttendance } from "../../hooks/use-self-service";

const NO_VALUE = "—";

/**
 * The student's season at a glance (owner, 2026-11-07: Home less stacked):
 * one card with the ring for how far through it is, sessions held, and their
 * own figures (absence budget left, D14; streak; assignments pending). The
 * attendance figures come from their own query (spec 19 §7), so when it fails
 * only those two step aside, with the error above. Opens the season page.
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
  if (!season) return null;
  const budget = attendance.data?.budget;
  const streak = attendance.data?.streak ?? null;
  const figures: PulseFigure[] = [
    ...(attendance.isError
      ? []
      : [
          { value: budget ? `${budget.remainingPct}%` : NO_VALUE, label: "Absence budget left" },
          { value: streak === null ? NO_VALUE : String(streak), label: "Streak" },
        ]),
    { value: String(data.assignments?.outstandingCount ?? 0), label: "Assignments pending" },
  ];

  return (
    <View className="gap-3">
      {attendance.isError ? (
        <InlineError
          message="Couldn't load your attendance."
          onRetry={() => void attendance.refetch()}
        />
      ) : null}
      <SeasonPulse
        title={season.title}
        progressPct={progress?.pct ?? null}
        sessionsHeld={progress?.sessionsHeld ?? 0}
        sessionsTotal={progress?.sessionsTotal ?? 0}
        figures={figures}
        onPress={() => router.push("/season")}
      />
    </View>
  );
}
