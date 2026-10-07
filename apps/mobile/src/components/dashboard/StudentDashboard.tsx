import { useRouter } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import {
  UPCOMING_EVENTS_LIMIT,
  type DashboardDueItem,
  type StudentDashboard as StudentData,
} from "@space/shared";

import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useUpcomingEvents } from "../../hooks/use-events";
import { useMyAttendance } from "../../hooks/use-self-service";
import { firstName, formatDayKey, formatWallTime } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { useTheme } from "../../theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Text } from "../../ui";
import { DashboardFrame } from "./DashboardFrame";
import { StatTile, TileRow } from "./StatTile";
import { UpcomingEventsCard } from "./UpcomingEventsCard";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function subtitle(data: StudentData | undefined): string {
  if (!data?.season || !data.assignments) return "Welcome to JPC Space";
  const n = data.assignments.outstandingCount;
  // v1 said "all caught up this week" while counting the whole season (R67).
  return n > 0
    ? `${n} ${plural(n, "assignment needs", "assignments need")} your attention`
    : "You're all caught up";
}

function dueLabel(a: DashboardDueItem): string {
  // Org-calendar day from the server (X13); "overdue" is the server's flag (C2).
  if (a.isOverdue) return `Overdue · was due ${formatDayKey(a.dueOrgDay)}`;
  return a.dueOrgDay ? `Due ${formatDayKey(a.dueOrgDay)}` : "No due date";
}

export function StudentDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const name = useSessionStore((s) => s.user?.name ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  const dash = useStudentDashboard(activeSeasonId);
  // Domain 4's numbers through domain 4's endpoint and cache (spec 19 §7, D14).
  // Gated on the season inside the hook (Plan 11).
  const attendance = useMyAttendance(activeSeasonId);
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);

  const refresh = () => {
    void dash.refetch();
    // `enabled` gates only the automatic run — guard the manual one too.
    if (activeSeasonId !== null) void attendance.refetch();
    void events.refetch();
  };

  const data = dash.data;

  return (
    <DashboardFrame
      onRefresh={refresh}
      refreshing={dash.isRefetching || attendance.isRefetching || events.isRefetching}
    >
      <Text variant="title">{`Welcome back, ${firstName(name)}`}</Text>
      <Text
        variant="body"
        color={theme.colors.neutral[600]}
        style={{ marginBottom: theme.spacing.md }}
      >
        {subtitle(data)}
      </Text>

      {dash.isPending ? (
        <LoadingState />
      ) : dash.isError ? (
        <ErrorState message="Couldn't load your dashboard." onRetry={() => void dash.refetch()} />
      ) : data === undefined || data.season === null ? (
        <EmptyState
          title="Not enrolled yet"
          message="You're not enrolled in a season yet. Make sure your profile is complete."
          action={<Button title="Complete your profile" onPress={() => router.push("/profile")} />}
        />
      ) : (
        <>
          {data.progress ? (
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">{data.season.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {data.progress.pct === null
                  ? "No sessions scheduled yet"
                  : data.progress.pct === 100
                    ? `Session ${data.progress.sessionsHeld} of ${data.progress.sessionsTotal} · complete`
                    : `Session ${data.progress.sessionsHeld} of ${data.progress.sessionsTotal} · ${
                        data.progress.sessionsTotal - data.progress.sessionsHeld
                      } ${plural(data.progress.sessionsTotal - data.progress.sessionsHeld, "session", "sessions")} to go`}
              </Text>
            </Card>
          ) : null}

          {attendance.isError ? (
            <ErrorState
              message="Couldn't load your attendance."
              onRetry={() => void attendance.refetch()}
            />
          ) : (
            <TileRow>
              <StatTile
                label="Absence budget left"
                value={attendance.data?.budget ? `${attendance.data.budget.remainingPct}%` : "—"}
                caption="this season"
                onPress={() => router.push("/attendance")}
              />
              <StatTile
                label="Streak"
                value={attendance.data ? String(attendance.data.streak) : "—"}
                caption="sessions in a row"
              />
            </TileRow>
          )}

          {data.assignments ? (
            <TileRow>
              <StatTile
                label="To do"
                value={String(data.assignments.outstandingCount)}
                caption={`${data.assignments.overdueCount} overdue`}
                tone={data.assignments.outstandingCount > 0 ? "warning" : "neutral"}
                onPress={() => router.push("/assignments")}
              />
            </TileRow>
          ) : null}

          {data.assignments && data.assignments.lateSubmittedCount > 0 ? (
            <Card
              style={{ marginBottom: theme.spacing.sm, backgroundColor: theme.colors.warning[50] }}
            >
              <Text variant="label" color={theme.colors.warning[800]}>
                {`You submitted ${data.assignments.lateSubmittedCount} ${plural(
                  data.assignments.lateSubmittedCount,
                  "assignment",
                  "assignments",
                )} late this season.`}
              </Text>
            </Card>
          ) : null}

          <Card style={{ marginBottom: theme.spacing.sm }}>
            {data.nextSession ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Session ${data.nextSession.title}`}
                onPress={() =>
                  router.push({
                    pathname: "/session/[id]",
                    params: { id: String(data.nextSession?.id) },
                  })
                }
              >
                <Text variant="caption" color={theme.colors.neutral[600]}>
                  {data.nextSession.isInProgress ? "Happening now" : "Next session"}
                </Text>
                <Text variant="heading">{data.nextSession.title}</Text>
                <Text variant="label" color={theme.colors.neutral[600]}>
                  {`${formatDayKey(data.nextSession.dayKey)} · ${formatWallTime(data.nextSession.time)}${
                    data.nextSession.location ? ` · ${data.nextSession.location}` : ""
                  }`}
                </Text>
              </Pressable>
            ) : (
              <Text variant="body">No upcoming sessions.</Text>
            )}
            {/* D13: a stream link only while the session is running; never "Watch recording" on a future one. */}
            {data.nextSession?.isInProgress && data.nextSession.youtubeUrl ? (
              <Button
                title="Join stream"
                variant="secondary"
                onPress={() => void Linking.openURL(data.nextSession?.youtubeUrl ?? "")}
              />
            ) : null}
          </Card>

          {data.assignments && data.assignments.dueSoon.length > 0 ? (
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">Due soon</Text>
              {data.assignments.dueSoon.map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.title}, ${dueLabel(a)}`}
                  onPress={() =>
                    router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })
                  }
                  style={{ paddingVertical: theme.spacing.sm }}
                >
                  <Text variant="label">{a.title}</Text>
                  <Text
                    variant="caption"
                    color={a.isOverdue ? theme.colors.error[600] : theme.colors.warning[700]}
                  >
                    {dueLabel(a)}
                  </Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      )}

      <View style={{ marginTop: theme.spacing.sm }}>
        <UpcomingEventsCard query={events} />
      </View>
    </DashboardFrame>
  );
}
