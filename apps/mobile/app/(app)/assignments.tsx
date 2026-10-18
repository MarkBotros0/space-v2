import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { FileText } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { StaffAssignmentListItem, StudentAssignmentListItem } from "@space/shared";

import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { cn } from "../../src/design/lib/cn";
import { shadowStyle } from "../../src/design/lib/shadow";
import { StatCard } from "../../src/design/students/stat-card";
import {
  Badge,
  Button,
  DataTable,
  EmptyState as EmptyStateV1,
  Text as TextV1,
  type DataTableColumn,
} from "../../src/design/ui";
import { useStaffAssignments, useStudentAssignments } from "../../src/hooks/use-assignments";
import { useSeasonGroups } from "../../src/hooks/use-groups";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { targetLabel } from "../../src/lib/assignment-labels";
import {
  formatDayKey,
  formatDistanceOnly,
  formatDueDate,
  formatShortDate,
} from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";

/** v1 student assignments dot + badge. RETURNED is v2's (v1 had no case): warning tone (B2-16). */
function rowTone(item: StudentAssignmentListItem): { dot: string; badge: ReactNode } {
  if (item.status === "REVIEWED")
    return { dot: "bg-success-500", badge: <Badge variant="success">Reviewed</Badge> };
  if (item.status === "SUBMITTED")
    return { dot: "bg-brand-teal-500", badge: <Badge variant="teal">Submitted</Badge> };
  if (item.status === "DRAFT")
    return { dot: "bg-warning-500", badge: <Badge variant="warning">Draft</Badge> };
  if (item.status === "RETURNED")
    return { dot: "bg-warning-500", badge: <Badge variant="warning">Returned</Badge> };
  // Overdue only ever describes work not yet handed in, and the flag comes
  // from the server (ruling C4) — a device in another timezone must agree
  // with the leader's screen.
  if (item.isOverdue) {
    return {
      dot: "bg-error-500",
      badge: <Badge variant="error">{`Due ${formatShortDate(item.dueAt)}`}</Badge>,
    };
  }
  return { dot: "bg-muted-foreground/30", badge: <Badge variant="outline">Not started</Badge> };
}

function AssignmentRow({
  item,
  first,
  last,
}: {
  item: StudentAssignmentListItem;
  first: boolean;
  last: boolean;
}) {
  const router = useRouter();
  const tone = rowTone(item);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(item.id) } })}
      className={cn(
        "flex-row items-center gap-3 px-4 py-3 active:bg-accent",
        !first && "border-t border-border",
        first && "pt-4",
        last && "pb-4",
      )}
    >
      <View className={cn("size-2 shrink-0 rounded-full", tone.dot)} />
      <View className="min-w-0 flex-1 flex-col gap-0.5">
        <TextV1
          numberOfLines={1}
          className="text-sm font-semibold text-brand-navy-900 dark:text-foreground"
        >
          {item.title}
        </TextV1>
        {item.dueAt ? (
          <TextV1 className="text-xs text-muted-foreground">
            {`Due ${formatDueDate(item.dueAt)}${item.isOverdue ? "" : ` · in ${formatDistanceOnly(item.dueAt)}`}`}
          </TextV1>
        ) : null}
      </View>
      {tone.badge}
    </Pressable>
  );
}

/** v1 app/student/assignments/page.tsx. */
function StudentAssignments({ seasonId }: { seasonId: number | null }) {
  const { data, isPending, isError, refetch, isRefetching } = useStudentAssignments(seasonId);

  let body: ReactNode;
  if (seasonId === null) {
    // v2-only: no season means no request at all.
    body = (
      <EmptyStateV1
        icon={FileText}
        title="No active season"
        description="You don't have an active season right now, so there are no assignments to show."
      />
    );
  } else if (isPending) body = <RouteSkeleton />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (data.length === 0)
    body = (
      <EmptyStateV1
        icon={FileText}
        title="No assignments yet"
        description="Check back when your leader posts one."
      />
    );
  else {
    // RETURNED counts in none of the three, as in v1.
    const submitted = data.filter(
      (r) => r.status === "SUBMITTED" || r.status === "REVIEWED",
    ).length;
    const pending = data.filter((r) => r.status === "PENDING" || r.status === "DRAFT").length;
    const reviewed = data.filter((r) => r.status === "REVIEWED").length;
    body = (
      <>
        <View className="flex-row gap-3">
          <StatCard label="Submitted" value={String(submitted)} />
          <StatCard
            label="Pending"
            value={String(pending)}
            variant={pending > 0 ? "teal" : "white"}
          />
          <StatCard label="Reviewed" value={String(reviewed)} />
        </View>
        <View className="rounded-2xl border border-border bg-card" style={shadowStyle("soft")}>
          {data.map((item, i) => (
            <AssignmentRow key={item.id} item={item} first={i === 0} last={i === data.length - 1} />
          ))}
        </View>
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
        <PageTitle title="Assignments" subtitle="Your current season" />
        {body}
      </View>
    </ShellFrame>
  );
}

/** v1 assignments-list.tsx dueBadge, with the overdue flag from the server (C4) and the org day (X13). */
function StaffDueBadge({ item }: { item: StaffAssignmentListItem }) {
  if (item.dueAt === null || item.dueOrgDay === null)
    return <Badge variant="outline">No due date</Badge>;
  if (item.isOverdue)
    return <Badge variant="warning">{`Due ${formatDayKey(item.dueOrgDay)}`}</Badge>;
  return <Badge variant="info">{`Due in ${formatDistanceOnly(item.dueAt)}`}</Badge>;
}

/**
 * Staff branch — v1 app/admin/season/[code]/assignments/page.tsx: "Assignments",
 * "{n} assignment(s)", "New assignment", and v1's AssignmentsList table
 * (Title / Due / Submissions / Scope). One list, for useCurrentSeasonId's
 * season (ruling X8) — v1's /admin/assignments was only a redirect to it
 * (spec 07 §9). SUPER and ADMIN author (§10 item 12 admits SUPER, whom v1's
 * ADMIN-only page refused); LEADER and MENTOR, who have no nav entry (R39) but
 * can arrive by link, read. The server gates every write. V2-ONLY kept: Scope
 * names the groups (v1 said only "Some groups").
 */
function StaffAssignments({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const current = useCurrentSeasonId();
  const list = useStaffAssignments(current.seasonId);
  // Only for the Scope names. A failure costs the names — the label falls back
  // to a group count — so it never blocks the list.
  const groups = useSeasonGroups(current.seasonId);

  const handleRefresh = () => {
    if (current.seasonId !== null) {
      void list.refetch();
      void groups.refetch();
    } else {
      current.refetch();
    }
  };
  const newAssignment = () => router.push("/assignment/new");

  const columns: DataTableColumn<StaffAssignmentListItem>[] = [
    {
      key: "title",
      header: "Title",
      cell: (row) => (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({ pathname: "/assignment/[id]", params: { id: String(row.id) } })
          }
        >
          <TextV1 className="font-medium text-foreground">{row.title}</TextV1>
        </Pressable>
      ),
    },
    { key: "due", header: "Due", cell: (row) => <StaffDueBadge item={row} /> },
    {
      key: "submissions",
      header: "Submissions",
      cell: (row) => (
        <TextV1 className="text-xs tabular-nums text-muted-foreground">{`${row.submissionCount}/${row.expectedCount} submitted`}</TextV1>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      cell: (row) => (
        <Badge variant={row.isAllGroups ? "secondary" : "outline"}>
          {targetLabel(row.isAllGroups, row.targetGroupIds, groups.data)}
        </Badge>
      ),
    },
  ];

  let body: ReactNode;
  if (current.isPending || (current.seasonId !== null && list.isPending)) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body = (
      <EmptyStateV1 title="No season" description="There's no season to show assignments for." />
    );
  else if (list.isError)
    body = <RouteError onRetry={() => void list.refetch()} />;
  else
    body = (
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        rowKey={(r) => r.id}
        emptyState={
          <EmptyStateV1
            icon={FileText}
            title="No assignments yet"
            description={
              canCreate
                ? "Create an assignment so students have something to submit."
                : "This season doesn't have any assignments yet."
            }
            action={canCreate ? <Button onPress={newAssignment}>New assignment</Button> : undefined}
          />
        }
      />
    );

  return (
    <ShellFrame onRefresh={handleRefresh} refreshing={list.isRefetching}>
      <View className="flex-col gap-4">
        <View className="flex-row items-start justify-between gap-4">
          <PageTitle
            className="min-w-0 flex-1"
            title="Assignments"
            subtitle={
              list.data
                ? `${list.data.length} ${list.data.length === 1 ? "assignment" : "assignments"}`
                : undefined
            }
          />
          {canCreate && current.seasonId !== null ? (
            <Button className="shrink-0" onPress={newAssignment}>
              New assignment
            </Button>
          ) : null}
        </View>
        {body}
      </View>
    </ShellFrame>
  );
}

export default function AssignmentsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  // D1: one route per destination; the role picks the branch. The student
  // query only mounts in the student branch, so staff never parse its arm.
  if (role !== "STUDENT") {
    return <StaffAssignments canCreate={role === "ADMIN" || role === "SUPER"} />;
  }
  return <StudentAssignments seasonId={seasonId} />;
}
