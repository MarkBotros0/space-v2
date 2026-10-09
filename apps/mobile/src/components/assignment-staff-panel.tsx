import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import type { AssignmentDetail, AssignmentTrackerRow, UserRole } from "@space/shared";

import { useAssignmentTracker } from "../hooks/use-assignments";
import { useDeleteAssignment } from "../hooks/use-assignment-writes";
import { useSeasonGroups } from "../hooks/use-groups";
import { apiErrorMessage } from "../lib/api-error";
import { configLabel, groupTrackerRows, targetLabel, trackerStatusLabel } from "../lib/assignment-labels";
import { useSessionStore } from "../store/session";
import { useTheme } from "../theme";
import { Button, Card, ErrorState, LoadingState, Text } from "../ui";

/**
 * Roles GET /assignments/:id/tracker answers: SUPER and season ADMINs only, as
 * v1 (assignments-query.ts:127-129; 07-assignments R59). It refuses LEADER,
 * MENTOR and STUDENT, so the screen does not ask on their behalf. This decides
 * only whether to ask; the server is the gate.
 * v1 parity 2026-10-09: was "LEADERs too, narrowed to their own groups".
 */
const TRACKER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["SUPER", "ADMIN"]);

function ManageActions({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const remove = useDeleteAssignment();
  // RN has no window.confirm; the first press arms, the second deletes.
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
    <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button
          title="Edit"
          variant="secondary"
          onPress={() => router.push({ pathname: "/assignment/[id]/edit", params: { id: String(detail.id) } })}
        />
        <Button
          title={armed ? "Really delete?" : "Delete assignment"}
          variant="ghost"
          onPress={onDelete}
          loading={remove.isPending}
        />
      </View>
      {message ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function TrackerRowView({ row }: { row: AssignmentTrackerRow }) {
  const theme = useTheme();
  const router = useRouter();
  const publicId = row.submissionPublicId;
  const line = `${trackerStatusLabel(row.status)}${row.isLate ? " · Late" : ""}`;

  const content = (
    <View style={{ paddingVertical: theme.spacing.xs }}>
      <Text variant="body">{row.name ?? row.email}</Text>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {line}
      </Text>
    </View>
  );

  // The handoff into the review screen (v1 submission-tracker.tsx:60-67).
  // Nothing to open until a submission row exists.
  if (publicId === null) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/submission/[publicId]", params: { publicId } })}
    >
      {content}
    </Pressable>
  );
}

function TrackerCard({ assignmentId }: { assignmentId: number }) {
  const theme = useTheme();
  const tracker = useAssignmentTracker(assignmentId);

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <Text variant="heading">Submissions</Text>
      {tracker.isPending ? (
        <LoadingState />
      ) : tracker.isError ? (
        <ErrorState message="Couldn't load the submission tracker." onRetry={() => void tracker.refetch()} />
      ) : (
        <>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`${tracker.data.submittedCount} of ${tracker.data.expectedCount} submitted`}
          </Text>
          {tracker.data.rows.length === 0 ? (
            <Text variant="body" color={theme.colors.neutral[600]}>
              No students are targeted by this assignment.
            </Text>
          ) : (
            groupTrackerRows(tracker.data.rows).map((group) => (
              <View key={group.groupId ?? "none"} style={{ marginTop: theme.spacing.sm }}>
                <Text variant="label" accessibilityRole="header">
                  {`${group.groupName} (${group.rows.length})`}
                </Text>
                {group.rows.map((row) => (
                  <TrackerRowView key={row.studentUserId} row={row} />
                ))}
              </View>
            ))
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The staff half of assignment/[id] (v1 /admin/season/[code]/assignments/[id]).
 * Edit and delete appear when the server says `canManage` (C4 — v1 rendered
 * no delete control at all, R80; v2's DELETE is designed, Plan 5 Task 5).
 */
export function AssignmentStaffPanel({ detail }: { detail: AssignmentDetail }) {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  // Names for "Assigned to" — not needed when the whole season is targeted.
  const groups = useSeasonGroups(detail.isAllGroups ? null : detail.seasonId);

  return (
    <>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.xs }}>
        <Text variant="label">
          {`Assigned to: ${targetLabel(detail.isAllGroups, detail.groupIds ?? [], groups.data)}`}
        </Text>
        <Text variant="label">{configLabel(detail)}</Text>
        {detail.sessionTitle ? <Text variant="label">{`Linked session: ${detail.sessionTitle}`}</Text> : null}
      </Card>
      {detail.canManage ? <ManageActions detail={detail} /> : null}
      {role !== null && TRACKER_ROLES.has(role) ? <TrackerCard assignmentId={detail.id} /> : null}
    </>
  );
}
