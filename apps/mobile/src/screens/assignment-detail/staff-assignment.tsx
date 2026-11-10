/**
 * The staff side of assignment/[id]: the due date, the instructions, the parts,
 * the reminder, Edit and Delete for whoever may manage it, and the students'
 * progress for the roles the server answers. The forum part opens on its own
 * screen to read the discussion; video and essay parts are followed in the
 * progress below.
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { MessagesSquare, PenLine, PlayCircle, type LucideIcon } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { AssignmentDetail, AssignmentPart, AssignmentPartKind, UserRole } from "@space/shared";

import { FormErrorBox } from "../../design/forms/form-parts";
import { iconWithClassName } from "../../design/lib/icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button, GroupedList, ListRow, RichTextView, StatusChip, Text } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { useAssignmentProgress } from "../../hooks/use-assignments";
import { useDeleteAssignment } from "../../hooks/use-assignment-writes";
import { usePullRefresh } from "../../hooks/use-pull-refresh";
import { apiErrorMessage } from "../../lib/api-error";
import { partKindLabel } from "../../lib/assignment-labels";
import { formatOrgDue } from "../../lib/format";
import { storedTextToHtml } from "../../lib/stored-text";
import { useRole } from "../../store/session";
import { AssignmentProgressList } from "./assignment-progress";

iconWithClassName(MessagesSquare, PenLine, PlayCircle);

const KIND_ICONS: Record<AssignmentPartKind, LucideIcon> = {
  VIDEO: PlayCircle,
  ESSAY: PenLine,
  FORUM: MessagesSquare,
};

/**
 * Roles GET /assignments/:id/progress answers: SUPER and season ADMINs with the
 * whole season, LEADERs narrowed to their own groups. It refuses MENTOR (who
 * reads across but follows no season, docs/rules/mentor.md) and STUDENT, so the
 * screen does not ask on their behalf. The server is the gate.
 */
const PROGRESS_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["SUPER", "ADMIN", "LEADER"]);

/** Edit, and Delete, which arms on the first press and deletes on the second. */
function ManageActions({ detail }: { detail: AssignmentDetail }) {
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
      // Pops the deleted assignment's detail rather than leaving it under Back.
      onSuccess: () => router.dismissTo("/assignments"),
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
          variant="secondary"
          onPress={() => router.push({ pathname: "/assignment/[id]/edit", params: { id: String(detail.id) } })}
        >
          Edit
        </Button>
        <Button variant="destructive" disabled={remove.isPending} onPress={onDelete}>
          {armed ? "Really delete?" : "Delete assignment"}
        </Button>
      </View>
      <FormErrorBox message={message} />
    </View>
  );
}

/** What a part is called: a video's title, an essay's or forum's question. */
function partName(part: AssignmentPart): string {
  return part.kind === "VIDEO" ? part.title : part.prompt;
}

function PartsList({ detail }: { detail: AssignmentDetail }) {
  const router = useRouter();
  if (detail.parts.length === 0) {
    return (
      <Text variant="subhead" className="rounded-group bg-surface p-4 text-muted-foreground">
        This assignment has no parts yet.
      </Text>
    );
  }
  const ordered = [...detail.parts].sort((a, b) => a.position - b.position);
  return (
    <View testID="assignment-parts">
      <GroupedList header="Parts">
        {ordered.map((part) => {
          const Icon = KIND_ICONS[part.kind];
          // Only the forum has something to read here; the others are followed in the progress.
          const opensForum = part.kind === "FORUM";
          return (
            <ListRow
              key={part.id}
              title={`${partKindLabel(part.kind)}: ${partName(part)}`}
              titleLines={2}
              subtitle={opensForum ? "Read the discussion" : undefined}
              leading={
                <Icon size={22} className="text-primary" accessibilityElementsHidden importantForAccessibility="no" />
              }
              chevron={opensForum}
              onPress={
                opensForum
                  ? () =>
                      router.push({
                        pathname: "/assignment/[id]/part/[partId]",
                        params: { id: String(detail.id), partId: String(part.id) },
                      })
                  : undefined
              }
            />
          );
        })}
      </GroupedList>
    </View>
  );
}

function StaffAssignment({ detail, refresh }: { detail: AssignmentDetail; refresh: () => Promise<unknown> }) {
  const role = useRole();
  const showsProgress = role !== null && PROGRESS_ROLES.has(role);
  const progress = useAssignmentProgress(showsProgress ? detail.id : null);
  const pull = usePullRefresh(() => Promise.all([refresh(), showsProgress ? progress.refetch() : undefined]));

  return (
    <Screen title={detail.title} subtitle={detail.seasonTitle} onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <View className="gap-5">
        <View className="flex-row flex-wrap items-center gap-2">
          {detail.isOverdue ? <StatusChip tone="bad" label="Overdue" /> : null}
          <Text variant="subhead" className="min-w-0 shrink text-muted-foreground">
            {/* The server's org-clock day and time (C2/X13), never dueAt in the device's zone. */}
            {detail.dueOrgDay === null ? "No due date" : `Due ${formatOrgDue(detail.dueOrgDay, detail.dueOrgTime)}`}
          </Text>
        </View>
        {detail.canManage ? <ManageActions detail={detail} /> : null}
        {detail.description ? (
          <View>
            <ListSectionHeader>Instructions</ListSectionHeader>
            {/* Descriptions hold v1's stored HTML or v2 plain text; never show raw tags (B3-16). */}
            <View className="rounded-group bg-surface p-4">
              <RichTextView html={storedTextToHtml(detail.description)} />
            </View>
          </View>
        ) : null}
        <PartsList detail={detail} />
        {detail.canManage && detail.reminderLine !== null ? (
          <View>
            <ListSectionHeader>Reminder</ListSectionHeader>
            <Text variant="subhead" className="rounded-group bg-surface p-4">
              {detail.reminderLine}
            </Text>
          </View>
        ) : null}
        {showsProgress ? (
          <View>
            <ListSectionHeader>Progress</ListSectionHeader>
            <AssignmentProgressList query={progress} parts={detail.parts} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/** The staff route body: loading and error states, then the assignment. */
export function StaffAssignmentView({ query }: { query: UseQueryResult<AssignmentDetail> }) {
  if (query.data === undefined) {
    return (
      <Screen title="Assignment">
        {query.isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void query.refetch()} />}
      </Screen>
    );
  }
  return <StaffAssignment detail={query.data} refresh={() => query.refetch()} />;
}
