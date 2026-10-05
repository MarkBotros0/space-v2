import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { SessionListItem } from "@space/shared";

import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { useSeasonSessions } from "../../src/hooks/use-sessions";
import { formatDayKey, formatSessionTime } from "../../src/lib/format";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

interface DayGroup {
  dayKey: string;
  sessions: SessionListItem[];
}

/**
 * Groups by the server's `dayKey` (ruling X13) — never by formatting
 * `startsAt` here, which would use the device zone. The API returns sessions
 * ordered by `startsAt`, so consecutive rows with the same key are one day.
 */
function groupByDay(sessions: SessionListItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const s of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.dayKey === s.dayKey) last.sessions.push(s);
    else groups.push({ dayKey: s.dayKey, sessions: [s] });
  }
  return groups;
}

export default function CalendarScreen() {
  // Decision D1's worked example: there is no role switch in this file. Which
  // season, and which sessions, are entirely the server's role-scoped answers.
  const theme = useTheme();
  const router = useRouter();
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);

  const handleRefresh = () => {
    if (current.seasonId !== null) void sessions.refetch();
    else current.refetch();
  };

  let body: ReactNode;
  if (current.isPending) {
    body = <LoadingState />;
  } else if (current.isError) {
    body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  } else if (current.seasonId === null) {
    body = (
      <EmptyState
        title="No season to show"
        message="You aren't in a season right now, so there are no sessions on your calendar."
      />
    );
  } else if (sessions.isPending) {
    body = <LoadingState />;
  } else if (sessions.isError) {
    body = (
      <ErrorState
        message="Couldn't load sessions. Check your connection and try again."
        onRetry={() => void sessions.refetch()}
      />
    );
  } else if (sessions.data.length === 0) {
    body = <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />;
  } else {
    body = groupByDay(sessions.data).map((group) => (
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
              {s.location ? `${formatSessionTime(s.startsAt)} · ${s.location}` : formatSessionTime(s.startsAt)}
            </Text>
          </Card>
        ))}
      </View>
    ));
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={handleRefresh}
      refreshing={sessions.isRefetching}
    >
      {body}
    </Screen>
  );
}
