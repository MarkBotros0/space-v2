import type { SessionListItem } from "@space/shared";

import { formatDate, formatSessionTime } from "../../src/lib/format";
import { useSeasonSessions } from "../../src/hooks/use-sessions";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function SessionRow({ session }: { session: SessionListItem }) {
  const theme = useTheme();

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <Text variant="heading">{session.title}</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {formatDate(session.startsAt)} · {formatSessionTime(session.startsAt)}
      </Text>
    </Card>
  );
}

export default function DashboardScreen() {
  // `activeSeasonId` is null whenever the signed-in user has no active
  // season (not yet enrolled anywhere, or between seasons) — that's a
  // distinct, expected state from "has a season but it has no sessions yet",
  // so it gets its own EmptyState message below rather than falling through
  // to a loading spinner that would never resolve.
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  const { data, isPending, isError, refetch, isRefetching } = useSeasonSessions(seasonId);

  const handleRefresh = () => {
    // Refetching a disabled query would still attempt the fetch (React
    // Query's `enabled` only gates the automatic run, not a manual one) —
    // guard it here so pulling to refresh with no active season can't fire
    // a request built from a null id.
    if (seasonId !== null) void refetch();
  };

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching}>
      {seasonId === null ? (
        <EmptyState
          title="No active season"
          message="You don't have an active season right now, so there are no sessions to show."
        />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />
      ) : (
        <>
          {data.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </>
      )}
    </Screen>
  );
}
