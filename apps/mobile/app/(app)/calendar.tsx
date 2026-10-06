import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SessionListItem } from "@space/shared";

import { SeasonSwitcher } from "../../src/components/SeasonSwitcher";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { useSeasonSessions, useSessionRange } from "../../src/hooks/use-sessions";
import { groupSessionsByDay } from "../../src/lib/day-groups";
import { formatDayKey, formatWallTime } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/** Day-grouped session cards. Every day and time is the server's org-clock value (X13). */
function SessionDays({ sessions, showSeason }: { sessions: SessionListItem[]; showSeason: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <>
      {groupSessionsByDay(sessions).map((group) => (
        <View key={group.dayKey} style={{ marginBottom: theme.spacing.md }}>
          <Text variant="heading">{formatDayKey(group.dayKey)}</Text>
          {group.sessions.map((s) => (
            <Card
              key={s.id}
              style={{ marginTop: theme.spacing.sm }}
              onPress={() => router.push({ pathname: "/session/[id]", params: { id: String(s.id) } })}
            >
              <Text variant="body">{s.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {s.location ? `${formatWallTime(s.startTime)} · ${s.location}` : formatWallTime(s.startTime)}
              </Text>
              {/* v1's per-season colour legend (R89) becomes a label on a phone. */}
              {showSeason ? <Text variant="caption" color={theme.colors.neutral[600]}>{s.seasonTitle}</Text> : null}
            </Card>
          ))}
        </View>
      ))}
    </>
  );
}

/** STUDENT / ALUMNI — Plan 4's pinned-season calendar (no window: one season). */
function PinnedSeasonCalendar() {
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);

  let body: ReactNode;
  if (current.isPending) body = <LoadingState />;
  else if (current.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body = <EmptyState title="No season to show" message="You aren't in a season right now, so there are no sessions on your calendar." />;
  else if (sessions.isPending) body = <LoadingState />;
  else if (sessions.isError)
    body = <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0) body = <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />;
  else body = <SessionDays sessions={sessions.data} showSeason={false} />;

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => {
        if (current.seasonId !== null) void sessions.refetch();
        else current.refetch();
      }}
      refreshing={sessions.isRefetching}
    >
      {body}
    </Screen>
  );
}

/** A windowed GET /sessions view (D-16.7) with Earlier / Later paging. */
function RangeSessions({ seasonId, showSeason }: { seasonId: number | null; showSeason: boolean }) {
  const theme = useTheme();
  const [window, setWindow] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const range = useSessionRange({ seasonId, from: window.from, to: window.to }, true);

  if (range.isPending) return <LoadingState />;
  if (range.isError) {
    return <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={() => void range.refetch()} />;
  }
  const data = range.data;
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.md }}>
        <Button title="Earlier" variant="ghost" onPress={() => setWindow({ from: null, to: data.from })} />
        <Text variant="label">{`${formatDayKey(data.fromDayKey)} – ${formatDayKey(data.toDayKey)}`}</Text>
        <Button title="Later" variant="ghost" onPress={() => setWindow({ from: data.to, to: null })} />
      </View>
      {data.sessions.length === 0 ? (
        <EmptyState title="No sessions" message="Nothing is scheduled in this window." />
      ) : (
        <SessionDays sessions={data.sessions} showSeason={showSeason} />
      )}
    </>
  );
}

/** SUPER (every ACTIVE season) and LEADER (every led season) — G17. */
function MultiSeasonCalendar() {
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <RangeSessions seasonId={null} showSeason />
    </Screen>
  );
}

/** ADMIN — one season at a time, switchable (spec 03 §9; v1 forced one via redirect, R86). */
function AdminCalendar() {
  const selection = useStaffSeasonSelection(true);
  let body: ReactNode;
  if (selection.isPending) body = <LoadingState />;
  else if (selection.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={selection.refetch} />;
  else if (selection.seasonId === null) body = <EmptyState title="No season to show" message="You aren't assigned to a season yet." />;
  else
    body = (
      <>
        <SeasonSwitcher seasons={selection.seasons} selectedId={selection.seasonId} onSelect={selection.setSeasonId} />
        {/* key: switching season starts again from the default window. */}
        <RangeSessions key={selection.seasonId} seasonId={selection.seasonId} showSeason={false} />
      </>
    );
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}

/**
 * /calendar — one route, every role (Decision D1). STUDENT/ALUMNI keep
 * Plan 4's pinned season; ADMIN gets a season switcher; SUPER and LEADER see
 * every season the server scopes them to, in an org-day window. MENTOR has
 * no calendar in its nav (spec 03 §9).
 */
export default function CalendarScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const leadsNothing = useSessionStore(
    (s) => s.user?.role === "LEADER" && (s.scopes?.groupLeaderIds.length ?? 0) === 0,
  );

  if (role === "MENTOR") {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Calendar" message="The calendar isn't available for your role." />
      </Screen>
    );
  }
  if (leadsNothing) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="No calendar" message="You don't lead any groups yet." />
      </Screen>
    );
  }
  if (role === "SUPER" || role === "LEADER") return <MultiSeasonCalendar />;
  if (role === "ADMIN") return <AdminCalendar />;
  return <PinnedSeasonCalendar />;
}
