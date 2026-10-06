import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { StaffAssignmentListItem, StudentAssignmentListItem } from "@space/shared";

import { useStaffAssignments, useStudentAssignments } from "../../src/hooks/use-assignments";
import { useSeasonGroups } from "../../src/hooks/use-groups";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { targetLabel } from "../../src/lib/assignment-labels";
import { formatDayKey, formatDueDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

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

function StaffAssignmentRow({
  item,
  groups,
}: {
  item: StaffAssignmentListItem;
  groups: { id: number; name: string }[] | undefined;
}) {
  const theme = useTheme();
  const router = useRouter();
  // The org-calendar day from the server (X13), never dueAt read in the device zone.
  const due = item.dueOrgDay === null ? "No due date" : `Due ${formatDayKey(item.dueOrgDay)}`;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(item.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.title}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {item.isOverdue ? `${due} · Overdue` : due}
        </Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {`${targetLabel(item.isAllGroups, item.targetGroupIds, groups)} · ${item.submissionCount}/${item.expectedCount} submitted`}
        </Text>
      </Card>
    </Pressable>
  );
}

/**
 * Staff branch (v1 /admin/season/[code]/assignments). One list, for
 * useCurrentSeasonId's season (ruling X8) — v1's /admin/assignments was only a
 * redirect to it (spec 07 §9). SUPER and ADMIN author (§10 item 12 admits
 * SUPER, whom v1's ADMIN-only page refused); LEADER and MENTOR, who have no
 * nav entry (R39) but can arrive by link, read. The server gates every write.
 */
function StaffAssignments({ canCreate }: { canCreate: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const current = useCurrentSeasonId();
  const list = useStaffAssignments(current.seasonId);
  // Only for the "Assigned to" names. A failure costs the names — the label
  // falls back to a group count — so it never blocks the list.
  const groups = useSeasonGroups(current.seasonId);

  const handleRefresh = () => {
    if (current.seasonId !== null) {
      void list.refetch();
      void groups.refetch();
    } else {
      current.refetch();
    }
  };

  let body: ReactNode;
  if (current.isPending) {
    body = <LoadingState />;
  } else if (current.isError) {
    body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  } else if (current.seasonId === null) {
    body = <EmptyState title="No season" message="There's no season to show assignments for." />;
  } else if (list.isPending) {
    body = <LoadingState />;
  } else if (list.isError) {
    body = <ErrorState message="Couldn't load assignments." onRetry={() => void list.refetch()} />;
  } else if (list.data.length === 0) {
    body = (
      <EmptyState
        title="No assignments yet"
        message={canCreate ? "Create the season's first assignment." : "This season doesn't have any assignments yet."}
      />
    );
  } else {
    body = list.data.map((item) => <StaffAssignmentRow key={item.id} item={item} groups={groups.data} />);
  }

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={handleRefresh} refreshing={list.isRefetching}>
      {canCreate && current.seasonId !== null ? (
        <Button
          title="New assignment"
          onPress={() => router.push("/assignment/new")}
          style={{ marginBottom: theme.spacing.md }}
        />
      ) : null}
      {body}
    </Screen>
  );
}

export default function AssignmentsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  // D1: one route per destination; the role picks the branch. The student
  // query is gated on role as well as season so staff never parse the
  // student arm.
  const isStudent = role === "STUDENT";
  const { data, isPending, isError, refetch, isRefetching } = useStudentAssignments(
    isStudent ? seasonId : null,
  );

  const handleRefresh = () => {
    if (isStudent && seasonId !== null) void refetch();
  };

  if (!isStudent) {
    return <StaffAssignments canCreate={role === "ADMIN" || role === "SUPER"} />;
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
