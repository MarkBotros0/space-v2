import { Calendar } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { MyAttendanceSession } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { Screen } from "../../src/design/layout/screen";
import {
  EmptyState,
  GroupedList,
  ListRow,
  StatTile,
  statusChip,
  StatusChip,
  type ChipSpec,
  Text,
} from "../../src/design/ui";
import { useMyAttendance } from "../../src/hooks/use-self-service";
import { formatWallTime, formatWeekdayDayYear } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";

/** The old ring's thresholds (70 warn, 100 error), as a word so it is never colour alone. */
function budgetWarning(pct: number | undefined): ChipSpec | null {
  if (pct === undefined) return null;
  if (pct >= 100) return { tone: "bad", label: "Over budget" };
  if (pct >= 70) return { tone: "warn", label: "Near limit" };
  return null;
}

/** One past session. Cost and lateness are the server's (R95, C4) — nothing is computed here. */
function SessionRow({ row }: { row: MyAttendanceSession }) {
  const chip = row.status ? statusChip("attendance", row.status) : { tone: "neutral" as const, label: "No record" };
  // Day and time are both the server's org-clock strings (X13), never the device zone.
  const lines = [`${formatWeekdayDayYear(row.dayKey)} · ${formatWallTime(row.startTime)}`];
  const cost = [
    row.status === "LATE" && row.lateMinutes !== null && row.lateMinutes > 0 ? `${row.lateMinutes} min late` : null,
    row.costMinutes !== null && row.costMinutes > 0 ? `−${row.costMinutes} min from budget` : null,
  ].filter(Boolean);
  if (cost.length > 0) lines.push(cost.join(" · "));
  return (
    <ListRow
      title={row.title}
      subtitle={lines.join("\n")}
      subtitleLines={3}
      trailing={<StatusChip {...chip} />}
      trailingLabel={chip.label}
    />
  );
}

/**
 * /attendance — v1 /student/attendance (spec 04 R93–R96). The budget, the
 * streak and every per-session cost come from GET /me/attendance, computed
 * once in lib/attendance-budget.ts (C4); Plan 16's dashboard tile reads the
 * same query key, so the two can never disagree.
 */
export default function AttendanceScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const seasonId = isStudent ? activeSeasonId : null;
  const { data, isPending, isError, refetch, isRefetching } = useMyAttendance(seasonId);

  const notEnrolled = (
    <EmptyState icon={Calendar} title="Not enrolled" description="Enroll in a season to track attendance." />
  );
  let body: ReactNode;
  if (!isStudent) {
    body = <EmptyState icon={Calendar} title="Not available" description="Attendance tracking is for students." />;
  } else if (seasonId === null) {
    body = notEnrolled;
  } else if (isPending) {
    body = <RouteSkeleton />;
  } else if (isError) {
    body = <RouteError onRetry={() => void refetch()} />;
  } else if (data.season === null) {
    body = notEnrolled;
  } else {
    const { budget, season, sessions } = data;
    const used = budget?.minutesUsed ?? 0;
    const warning = budgetWarning(budget?.budgetPct);
    const allowed = budget?.budgetMinutes ?? season.absenceBudgetMinutes;
    body = (
      <View className="flex-col gap-5">
        <View className="flex-col gap-2">
          <View className="flex-row flex-wrap gap-3">
            <StatTile value={budget?.budgetPct ?? 0} suffix="%" label="Budget used" />
            <StatTile value={`${used}/${allowed}`} label="Minutes used" />
          </View>
          {warning ? <StatusChip {...warning} /> : null}
          <Text variant="caption" className="text-muted-foreground">
            {`Absent = ${season.absenceWeightMinutes} min · Late = actual minutes late`}
          </Text>
        </View>
        {sessions.length === 0 ? (
          <EmptyState icon={Calendar} title="No sessions yet" description="Past sessions will appear here." />
        ) : (
          <GroupedList header="Session history">
            {sessions.map((row) => (
              <SessionRow key={row.sessionId} row={row} />
            ))}
          </GroupedList>
        )}
      </View>
    );
  }

  return (
    <Screen
      title="Attendance"
      onRefresh={() => {
        if (seasonId !== null) void refetch();
      }}
      refreshing={isRefetching}
    >
      {body}
    </Screen>
  );
}
