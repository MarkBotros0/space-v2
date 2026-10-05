import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { StudentAssignmentListItem } from "@space/shared";

import { useStudentAssignments } from "../../src/hooks/use-assignments";
import { formatDueDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function statusLabel(item: StudentAssignmentListItem): string {
  if (item.status === "REVIEWED") return "Reviewed";
  if (item.status === "RETURNED") return "Returned";
  if (item.status === "SUBMITTED") return "Submitted";
  if (item.status === "DRAFT") return "Draft";
  // Only PENDING (nothing started) reaches here. Overdue only ever describes
  // work not yet handed in, and the flag comes from the server (ruling C4) —
  // a device in another timezone must agree with the leader's screen.
  return item.isOverdue ? "Overdue" : "Not started";
}

function AssignmentRow({ item }: { item: StudentAssignmentListItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`Due ${formatDueDate(item.dueAt)} · ${statusLabel(item)}`}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function AssignmentsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  // Staff land here too (D1: one route per destination). Their branch is
  // Plan 5's; querying the student hook for them would parse the wrong
  // schema arm, so the query is gated on role as well as season.
  const isStudent = role === "STUDENT";
  const { data, isPending, isError, refetch, isRefetching } = useStudentAssignments(
    isStudent ? seasonId : null,
  );

  const handleRefresh = () => {
    if (isStudent && seasonId !== null) void refetch();
  };

  if (!isStudent) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Assignments" message="Managing assignments isn't available in the app yet." />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching}>
      {seasonId === null ? (
        <EmptyState
          title="No active season"
          message="You don't have an active season right now, so there are no assignments to show."
        />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load assignments. Check your connection and try again." onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No assignments" message="This season doesn't have any assignments yet." />
      ) : (
        <>
          {data.map((item) => (
            <AssignmentRow key={item.id} item={item} />
          ))}
        </>
      )}
    </Screen>
  );
}
