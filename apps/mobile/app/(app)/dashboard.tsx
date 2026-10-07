import { isAssignmentOutstanding, type SessionListItem, type StudentAssignmentListItem } from "@space/shared";

import { NotificationBell } from "../../src/components/NotificationBell";
import { formatDate, formatSessionTime } from "../../src/lib/format";
import { useStudentAssignments } from "../../src/hooks/use-assignments";
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

function AssignmentsSummary({ rows }: { rows: StudentAssignmentListItem[] }) {
  const theme = useTheme();
  // "To do" = outstanding per the one shared definition (C5, spec 19 D15).
  // Overdue is the server's flag (C4); this counts rows, it derives nothing.
  const todo = rows.filter((a) => isAssignmentOutstanding(a.status));
  const overdue = todo.filter((a) => a.isOverdue);

  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <Text variant="heading">Assignments</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        {`${todo.length} to do · ${overdue.length} overdue`}
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
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStudent = role === "STUDENT";
  const assignments = useStudentAssignments(isStudent ? seasonId : null);

  const handleRefresh = () => {
    // Refetching a disabled query would still attempt the fetch (React
    // Query's `enabled` only gates the automatic run, not a manual one) —
    // guard both so pulling to refresh with no active season (or as staff,
    // for the student-only assignments query) can't fire a request built
    // from a null id.
    if (seasonId === null) return;
    void refetch();
    if (isStudent) void assignments.refetch();
  };

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching}>
      <NotificationBell />
      {assignments.data ? <AssignmentsSummary rows={assignments.data} /> : null}
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
