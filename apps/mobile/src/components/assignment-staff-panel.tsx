import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { AssignmentDetail, AssignmentTrackerRow, UserRole } from "@space/shared";

import { useAssignmentTracker } from "../hooks/use-assignments";
import { useDeleteAssignment } from "../hooks/use-assignment-writes";
import { useSeasonGroups } from "../hooks/use-groups";
import { apiErrorMessage } from "../lib/api-error";
import { configLabel, groupTrackerRows, targetLabel } from "../lib/assignment-labels";
import { useSessionStore } from "../store/session";
import { FormErrorBox } from "../design/forms/form-parts";
import { Eyebrow } from "../design/layout/page-title";
import { RouteError } from "../design/layout/route-states";
import {
  Badge,
  Button,
  DataTable,
  Skeleton,
  SubmissionStatusBadge,
  Text,
  type DataTableColumn,
} from "../design/ui";
import { formatShortDateTime } from "../lib/format";

/**
 * Roles GET /assignments/:id/tracker answers: SUPER and season ADMINs with
 * the whole roster, LEADERs narrowed to their own groups. It refuses MENTOR
 * and STUDENT, so the screen does not ask on their behalf. This decides only
 * whether to ask; the server is the gate.
 */
const TRACKER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["SUPER", "ADMIN", "LEADER"]);

/**
 * v1's header button row: "Edit assignment" (outline). V2-ONLY: the delete
 * control (v1 rendered none, R80) — RN has no window.confirm, so the first
 * press arms and the second deletes.
 */
export function ManageActions({ detail }: { detail: AssignmentDetail }) {
  const router = useRouter();
  const remove = useDeleteAssignment();
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setMessage(null);
    remove.mutate(detail.id, {
      onSuccess: () => router.replace("/assignments"),
      onError: (err) => {
        setArmed(false);
        setMessage(apiErrorMessage(err, "Couldn't delete the assignment."));
      },
    });
  };

  return (
    <View className="flex-col gap-2">
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          onPress={() =>
            router.push({ pathname: "/assignment/[id]/edit", params: { id: String(detail.id) } })
          }
        >
          Edit
        </Button>
        <Button
          variant={armed ? "destructive" : "ghost"}
          disabled={remove.isPending}
          onPress={onDelete}
        >
          {armed ? "Really delete?" : "Delete assignment"}
        </Button>
      </View>
      <FormErrorBox message={message} />
    </View>
  );
}

/** v1 submission-tracker.tsx columns: Student, Status (+ Late), Submitted, Open. */
function trackerColumns(
  onOpen: (publicId: string) => void,
): DataTableColumn<AssignmentTrackerRow>[] {
  return [
    {
      key: "student",
      header: "Student",
      cell: (row) => (
        <View className="flex-col">
          <Text className="font-medium text-foreground">{row.name ?? row.email}</Text>
          {row.name ? <Text className="text-xs text-muted-foreground">{row.email}</Text> : null}
        </View>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <View className="flex-row items-center gap-1.5">
          {row.status === "PENDING" ? (
            <Badge variant="outline">Not started</Badge>
          ) : (
            <SubmissionStatusBadge status={row.status} />
          )}
          {row.isLate ? <Badge variant="warning">Late</Badge> : null}
        </View>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (row) =>
        row.submittedAt ? (
          <Text className="text-xs text-muted-foreground">
            {formatShortDateTime(row.submittedAt)}
          </Text>
        ) : (
          <Text className="text-xs italic text-muted-foreground">—</Text>
        ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) =>
        row.submissionPublicId !== null ? (
          <Button
            variant="outline"
            size="sm"
            onPress={() => onOpen(row.submissionPublicId as string)}
          >
            Open
          </Button>
        ) : (
          <Text className="text-xs text-muted-foreground">—</Text>
        ),
    },
  ];
}

function TrackerBlock({ assignmentId }: { assignmentId: number }) {
  const router = useRouter();
  const tracker = useAssignmentTracker(assignmentId);

  if (tracker.isPending) return <Skeleton className="h-24 w-full rounded-2xl" />;
  if (tracker.isError) return <RouteError onRetry={() => void tracker.refetch()} />;

  // The handoff into the review screen (v1 submission-tracker.tsx:60-67).
  const columns = trackerColumns((publicId) =>
    router.push({ pathname: "/submission/[publicId]", params: { publicId } }),
  );
  return (
    <View className="flex-col gap-3">
      <Badge className="self-start" variant="secondary">
        {`${tracker.data.submittedCount}/${tracker.data.expectedCount} submitted`}
      </Badge>
      {tracker.data.rows.length === 0 ? (
        <Text className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          No students targeted by this assignment.
        </Text>
      ) : (
        groupTrackerRows(tracker.data.rows).map((group) => (
          <View key={group.groupId ?? "none"} className="flex-col gap-2">
            {/* V2-ONLY: grouped under a header (REG-84); v1 listed one flat table. */}
            <Eyebrow>{`${group.groupName} (${group.rows.length})`}</Eyebrow>
            <DataTable columns={columns} rows={group.rows} rowKey={(r) => r.studentUserId} />
          </View>
        ))
      )}
    </View>
  );
}

/**
 * The staff half of assignment/[id] (v1 /admin/season/[code]/assignments/[id]):
 * the badge row (scope, file settings, linked session) and the submission
 * tracker. Edit and delete appear when the server says `canManage` (C4).
 */
export function AssignmentStaffPanel({ detail }: { detail: AssignmentDetail }) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Names for the scope badge — not needed when the whole season is targeted.
  const groups = useSeasonGroups(detail.isAllGroups ? null : detail.seasonId);

  return (
    <View className="flex-col gap-4">
      <View className="flex-row flex-wrap gap-2">
        <Badge variant={detail.isAllGroups ? "secondary" : "outline"}>
          {targetLabel(detail.isAllGroups, detail.groupIds ?? [], groups.data)}
        </Badge>
        <Badge variant="outline">{configLabel(detail)}</Badge>
        {detail.sessionTitle ? (
          <Badge variant="outline">{`Session: ${detail.sessionTitle}`}</Badge>
        ) : null}
      </View>
      {detail.canManage ? <ManageActions detail={detail} /> : null}
      {role !== null && TRACKER_ROLES.has(role) ? <TrackerBlock assignmentId={detail.id} /> : null}
    </View>
  );
}
