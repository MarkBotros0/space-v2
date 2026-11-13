import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable } from "../../src/design/ui/pressable";
import type { StaffAssignmentListItem } from "@space/shared";

import { NAV_ICONS } from "../../src/design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { Screen } from "../../src/design/layout/screen";
import {
  Badge,
  Button,
  DataTable,
  EmptyState as EmptyStateV1,
  Text as TextV1,
  type DataTableColumn,
} from "../../src/design/ui";
import { useStaffAssignments } from "../../src/hooks/use-assignments";
import { formatDayKey, formatDistanceOnly } from "../../src/lib/format";
import { plural } from "../../src/lib/plural";
import { WorkScreen } from "../../src/screens/work/work-screen";
import { useSeasonParamOrCurrent } from "../../src/hooks/use-season-param";
import { useRole } from "../../src/store/session";

/** v1 assignments-list.tsx dueBadge, with the overdue flag from the server (C4) and the org day (X13). */
function StaffDueBadge({ item }: { item: StaffAssignmentListItem }) {
  if (item.dueAt === null || item.dueOrgDay === null) return <Badge variant="outline">No due date</Badge>;
  if (item.isOverdue) return <Badge variant="warning">{`Due ${formatDayKey(item.dueOrgDay)}`}</Badge>;
  return <Badge variant="info">{`Due in ${formatDistanceOnly(item.dueAt)}`}</Badge>;
}

/**
 * Staff branch — v1 app/admin/season/[code]/assignments/page.tsx: "Assignments",
 * "{n} assignment(s)", "New assignment", and v1's AssignmentsList table
 * (Title / Due / Submissions), then Parts. One list, for useCurrentSeasonId's
 * season (ruling X8) — v1's /admin/assignments was only a redirect to it
 * (spec 07 §9). SUPER and ADMIN author (§10 item 12 admits SUPER, whom v1's
 * ADMIN-only page refused); LEADER and MENTOR, who have no nav entry (R39) but
 * can arrive by link, read. The server gates every write. There is no Scope:
 * an assignment is always for the whole season (multi-part assignments spec).
 */
function StaffAssignments({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const current = useSeasonParamOrCurrent();
  const list = useStaffAssignments(current.seasonId);

  const handleRefresh = () => {
    if (current.seasonId !== null) {
      void list.refetch();
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
          onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(row.id) } })}
        >
          <TextV1 className="font-medium text-foreground">{row.title}</TextV1>
        </Pressable>
      ),
    },
    {
      key: "submissions",
      header: "Submissions",
      cell: (row) => (
        <TextV1 className="text-xs tabular-nums text-muted-foreground">{`${row.submissionCount}/${row.expectedCount} submitted`}</TextV1>
      ),
    },
    { key: "due", header: "Due", cell: (row) => <StaffDueBadge item={row} /> },
    {
      key: "parts",
      header: "Parts",
      cell: (row) => <Badge variant="outline">{plural(row.partsCount, "part")}</Badge>,
    },
  ];

  let body: ReactNode;
  if (current.isPending || (current.seasonId !== null && list.isPending)) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body = <EmptyStateV1 title="No season" description="There's no season to show assignments for." />;
  else if (list.isError) body = <RouteError onRetry={() => void list.refetch()} />;
  else
    body = (
      <DataTable
        columns={columns}
        rows={list.data ?? []}
        rowKey={(r) => r.id}
        emptyState={
          <EmptyStateV1
            icon={NAV_ICONS.assignments}
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
    <Screen
      title="Assignments"
      subtitle={list.data ? `${list.data.length} ${list.data.length === 1 ? "assignment" : "assignments"}` : undefined}
      trailing={
        canCreate && current.seasonId !== null ? <Button onPress={newAssignment}>New assignment</Button> : undefined
      }
      onRefresh={handleRefresh}
      refreshing={list.isRefetching}
    >
      {body}
    </Screen>
  );
}

export default function AssignmentsScreen() {
  const role = useRole();
  // D1: one route per destination; the role picks the branch. A student's work
  // is the Work tab; an old link shows it here on the stack, with its Back bar,
  // never a replace to a tab (P2-11).
  if (role !== "STUDENT") {
    return <StaffAssignments canCreate={role === "ADMIN" || role === "SUPER"} />;
  }
  return <WorkScreen />;
}
