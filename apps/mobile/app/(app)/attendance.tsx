import type { ReactNode } from "react";
import { View } from "react-native";
import type { MyAttendanceSession } from "@space/shared";

import { useMyAttendance } from "../../src/hooks/use-self-service";
import { formatDayKey, formatSessionTime } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

const EDGES = ["top", "left", "right"] as const;

function statusLabel(status: MyAttendanceSession["status"]): string {
  if (status === "PRESENT") return "Present";
  if (status === "LATE") return "Late";
  if (status === "ABSENT") return "Absent";
  return "No record";
}

/** One past session. Cost and lateness are the server's (R95, C4) — nothing is computed here. */
function SessionRow({ row }: { row: MyAttendanceSession }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: theme.borderWidths.thin,
        borderTopColor: theme.colors.neutral[100],
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="body">{row.title}</Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {`${formatDayKey(row.dayKey)} · ${formatSessionTime(row.startsAt)}`}
        </Text>
        {row.lateMinutes !== null && row.lateMinutes > 0 ? (
          <Text variant="caption" color={theme.colors.warning[700]}>{`${row.lateMinutes} min late`}</Text>
        ) : null}
        {row.costMinutes !== null && row.costMinutes > 0 ? (
          <Text variant="caption" color={theme.colors.error[600]}>{`−${row.costMinutes} min from budget`}</Text>
        ) : null}
      </View>
      <Text variant="label">{statusLabel(row.status)}</Text>
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
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const isStudent = role === "STUDENT";
  const seasonId = isStudent ? activeSeasonId : null;
  const { data, isPending, isError, refetch, isRefetching } = useMyAttendance(seasonId);

  const notEnrolled = <EmptyState title="Not enrolled" message="Enroll in a season to track attendance." />;
  let body: ReactNode;
  if (!isStudent) {
    body = <EmptyState title="Not available" message="Attendance tracking is for students." />;
  } else if (seasonId === null) {
    body = notEnrolled;
  } else if (isPending) {
    body = <LoadingState />;
  } else if (isError) {
    body = <ErrorState message="Couldn't load your attendance." onRetry={() => void refetch()} />;
  } else if (data.season === null) {
    body = notEnrolled;
  } else {
    const { budget, season, streak, sessions } = data;
    body = (
      <>
        <Card style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Absence budget
          </Text>
          <Text
            variant="title"
            color={budget !== null && budget.budgetPct >= 100 ? theme.colors.error[600] : undefined}
          >
            {budget !== null ? `${budget.budgetPct}% used` : "—"}
          </Text>
          {budget !== null ? (
            <Text variant="body">{`${budget.minutesUsed} of ${budget.budgetMinutes} min`}</Text>
          ) : null}
          <Text variant="caption" color={theme.colors.neutral[600]}>
            {`Absent = ${season.absenceWeightMinutes} min · Late = actual minutes late`}
          </Text>
          <Text variant="label">{`Streak: ${streak} ${streak === 1 ? "session" : "sessions"}`}</Text>
        </Card>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions yet" message="Past sessions will appear here." />
        ) : (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="heading">Session history</Text>
            {sessions.map((row) => (
              <SessionRow key={row.sessionId} row={row} />
            ))}
          </Card>
        )}
      </>
    );
  }

  return (
    <Screen
      edges={EDGES}
      scroll
      onRefresh={() => {
        if (seasonId !== null) void refetch();
      }}
      refreshing={isRefetching}
    >
      <Text variant="title">Attendance</Text>
      {body}
    </Screen>
  );
}
