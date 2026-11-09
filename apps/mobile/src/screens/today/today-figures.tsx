import { useRouter } from "expo-router";
import { View } from "react-native";
import type { StudentDashboard } from "@space/shared";

import { SeasonPulse, type PulseFigure } from "../../design/home/season-pulse";
import { InlineError } from "../../design/layout/route-states";
import type { useMyAttendance } from "../../hooks/use-self-service";

const NO_VALUE = "—";

/**
 * How many more full absences the budget allows (owner, 2026-11-09: "100% Absence
 * budget left" was jargon). A late uses minutes too, so this rounds down: with 75
 * minutes left and 90 per absence, one more absence is over budget and it reads 0.
 */
export function absencesLeft(attendance: ReturnType<typeof useMyAttendance>["data"]): number | null {
  const budget = attendance?.budget;
  const weight = attendance?.season?.absenceWeightMinutes;
  if (!budget || !weight) return null;
  return Math.floor(Math.max(0, budget.budgetMinutes - budget.minutesUsed) / weight);
}

/**
 * The student's season at a glance (owner, 2026-11-07: Home less stacked):
 * one card with the ring for how far through it is, sessions held, and their
 * own figures (absences left of the budget, D14; assignments pending; no streak, owner
 * 2026-11-07). The budget comes from its own query (spec 19 §7), so when it fails
 * only it steps aside, with the error above. Opens the season page.
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
  const left = absencesLeft(attendance.data);
  const figures: PulseFigure[] = [
    ...(attendance.isError
      ? []
      : [
          {
            value: left === null ? NO_VALUE : String(left),
            label: left === 1 ? "Absence left" : "Absences left",
          },
        ]),
    { value: String(data.assignments?.outstandingCount ?? 0), label: "Assignments pending" },
  ];

  return (
    <View className="gap-3">
      {attendance.isError ? (
        <InlineError message="Couldn't load your attendance." onRetry={() => void attendance.refetch()} />
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
