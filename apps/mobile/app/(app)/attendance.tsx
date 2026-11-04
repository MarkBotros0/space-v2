import { useRouter } from "expo-router";
import { Calendar } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { MyAttendanceSession } from "@space/shared";

import { BackLink, Eyebrow } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { cn } from "../../src/design/lib/cn";
import { shadowStyle } from "../../src/design/lib/shadow";
import { Badge, EmptyState, ProgressRing, Text } from "../../src/design/ui";
import { useMyAttendance } from "../../src/hooks/use-self-service";
import { formatWallTime, formatWeekdayDayYear } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";

function StatusBadge({ status }: { status: MyAttendanceSession["status"] }) {
  if (status === "PRESENT") return <Badge variant="success">Present</Badge>;
  if (status === "LATE") return <Badge variant="warning">Late</Badge>;
  if (status === "ABSENT") return <Badge variant="error">Absent</Badge>;
  return <Badge variant="outline">No record</Badge>;
}

/** One past session. Cost and lateness are the server's (R95, C4) — nothing is computed here. */
function SessionRow({ row, first, last }: { row: MyAttendanceSession; first: boolean; last: boolean }) {
  return (
    <View className={cn("flex-row items-start gap-3 px-4 py-3", !first && "border-t border-border", last && "pb-4")}>
      <View className="mt-0.5 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-brand-navy-900 dark:text-foreground">
          {row.title}
        </Text>
        {/* Day and time are both the server's org-clock strings (X13), never the device zone. */}
        <Text className="text-xs text-muted-foreground">
          {`${formatWeekdayDayYear(row.dayKey)} · ${formatWallTime(row.startTime)}`}
        </Text>
        {row.status === "LATE" && row.lateMinutes !== null && row.lateMinutes > 0 ? (
          <Text className="mt-0.5 text-xs text-warning-700 dark:text-warning-300">{`${row.lateMinutes} min late`}</Text>
        ) : null}
        {row.costMinutes !== null && row.costMinutes > 0 ? (
          <Text className="mt-0.5 text-xs text-error-600 dark:text-error-400">{`−${row.costMinutes} min from budget`}</Text>
        ) : null}
      </View>
      <View className="shrink-0 pt-0.5">
        <StatusBadge status={row.status} />
      </View>
    </View>
  );
}

/**
 * /attendance — v1 /student/attendance (spec 04 R93–R96). The budget, the
 * streak and every per-session cost come from GET /me/attendance, computed
 * once in lib/attendance-budget.ts (C4); Plan 16's dashboard tile reads the
 * same query key, so the two can never disagree.
 */
export default function AttendanceScreen() {
  const router = useRouter();
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
    const pct = budget?.budgetPct ?? 0;
    const tone = pct >= 100 ? "stroke-error-500" : pct >= 70 ? "stroke-warning-500" : undefined;
    body = (
      <>
        <View className="rounded-2xl border border-border bg-card p-5" style={shadowStyle("soft")}>
          <View className="flex-row items-center gap-5">
            <ProgressRing value={pct} label={`Absence budget ${pct}% used`} indicatorClassName={tone}>
              <Text className="text-2xl font-black text-brand-navy-900 dark:text-foreground">{`${pct}%`}</Text>
              <Eyebrow className="mt-1">used</Eyebrow>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Eyebrow tone="teal">Absence budget</Eyebrow>
              <Text className="mt-1 text-lg font-black text-brand-navy-900 dark:text-foreground">
                {`${budget?.minutesUsed ?? 0} of ${budget?.budgetMinutes ?? season.absenceBudgetMinutes} min`}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {`Absent = ${season.absenceWeightMinutes} min · Late = actual minutes late`}
              </Text>
            </View>
          </View>
        </View>
        {sessions.length === 0 ? (
          <EmptyState icon={Calendar} title="No sessions yet" description="Past sessions will appear here." />
        ) : (
          <View className="rounded-2xl border border-border bg-card" style={shadowStyle("soft")}>
            <Eyebrow className="px-4 pt-4">Session history</Eyebrow>
            <View className="mt-2">
              {sessions.map((row, i) => (
                <SessionRow key={row.sessionId} row={row} first={i === 0} last={i === sessions.length - 1} />
              ))}
            </View>
          </View>
        )}
      </>
    );
  }

  return (
    <ShellFrame
      onRefresh={() => {
        if (seasonId !== null) void refetch();
      }}
      refreshing={isRefetching}
    >
      <View className="flex-col gap-3">
        <View>
          <BackLink label="Dashboard" onPress={() => router.push("/dashboard")} />
          <Text accessibilityRole="header" className="mt-2 text-2xl font-black text-brand-navy-900 dark:text-foreground">
            Attendance
          </Text>
        </View>
        {body}
      </View>
    </ShellFrame>
  );
}
