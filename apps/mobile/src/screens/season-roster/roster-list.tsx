import { useState } from "react";
import { View } from "react-native";
import type { ReactNode } from "react";
import type { SeasonRosterRow } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import {
  Avatar,
  AvatarFallback,
  Button,
  EmptyState,
  ConfirmDialog,
  GroupedList,
  ListRow,
  SearchField,
  StatusChip,
  toast,
} from "../../design/ui";
import { useSaveGroupAssignments, useSeasonRoster } from "../../hooks/use-group-admin";
import { useSeasonGroups } from "../../hooks/use-groups";
import { useRemoveSeasonPerson } from "../../hooks/use-season-people";
import { apiErrorMessage } from "../../lib/api-error";
import { initialsOf } from "../../lib/initials";
import { joinMeta } from "../../lib/join-meta";
import { AssignSheet, ROSTER_UNASSIGNED_LABEL } from "./assign-sheet";

/**
 * The season's roster (v1 roster-grid.tsx; spec 05 §9; G7): a row per ACTIVE
 * enrolment (C9) with the student's email and group. A row opens the group
 * sheet; picking stages the choice ("Not saved") and the bar saves every
 * staged row in one write (v1 R100: only rows whose choice differs), reporting
 * the server's WRITTEN counts, not the number sent (R101/D-16.12). Picking a
 * student's own group unstages them. V2-ONLY: the search box.
 */
export function RosterList({
  seasonId,
  seasonTitle,
  trailing,
  seasonIsDraft = false,
  onNewGroup,
}: {
  seasonId: number;
  seasonTitle: string;
  /** The season has not started: a row can be removed from it. */
  seasonIsDraft?: boolean;
  trailing?: ReactNode;
  onNewGroup: () => void;
}) {
  const roster = useSeasonRoster(seasonId);
  const groups = useSeasonGroups(seasonId);
  const save = useSaveGroupAssignments(seasonId);
  const [draft, setDraft] = useState<Record<number, number | null>>({});
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SeasonRosterRow | null>(null);
  const [removing, setRemoving] = useState<SeasonRosterRow | null>(null);
  const removePerson = useRemoveSeasonPerson(seasonId);

  const frame = (children: ReactNode, subtitle?: string, footer?: ReactNode) => (
    <Screen title="Students and groups" subtitle={subtitle} trailing={trailing} footer={footer}>
      {children}
    </Screen>
  );

  if (roster.isPending || groups.isPending) return frame(<RouteSkeleton />);
  if (roster.isError) return frame(<RouteError onRetry={() => void roster.refetch()} />);
  if (groups.isError) return frame(<RouteError onRetry={() => void groups.refetch()} />);
  const count = roster.data.length;
  const subtitle = `${count} student${count === 1 ? "" : "s"} in ${seasonTitle}. Tap a student to set their group.`;
  if (count === 0) {
    return frame(
      <EmptyState
        icon={NAV_ICONS.students}
        title="No students in this season"
        description="Students appear here once their active season is set for this season (e.g. via the profile import)."
      />,
      subtitle,
    );
  }
  if (groups.data.length === 0) {
    return frame(
      <EmptyState
        icon={NAV_ICONS.groups}
        title="No groups yet"
        description="Create at least one group before assigning students."
        action={<Button onPress={onNewGroup}>New group</Button>}
      />,
      subtitle,
    );
  }

  const choice = (r: SeasonRosterRow) => (r.userId in draft ? (draft[r.userId] ?? null) : r.groupId);
  const pick = (r: SeasonRosterRow, groupId: number | null) => {
    setDraft((d) => {
      const next = { ...d };
      if (groupId === r.groupId) delete next[r.userId];
      else next[r.userId] = groupId;
      return next;
    });
    setEditing(null);
  };
  // Roster order, so the batch is deterministic.
  const changes = roster.data
    .filter((r) => r.userId in draft)
    .map((r) => ({ studentUserId: r.userId, groupId: draft[r.userId] ?? null }));
  const groupName = (id: number | null) =>
    id === null ? ROSTER_UNASSIGNED_LABEL : (groups.data.find((g) => g.id === id)?.name ?? ROSTER_UNASSIGNED_LABEL);

  const onSave = () => {
    if (changes.length === 0) return;
    save.mutate(
      { assignments: changes },
      {
        onSuccess: (result) => {
          setDraft({});
          const skipped = result.skippedStudentIds.length;
          toast.success(
            `Assigned ${result.assigned}, unassigned ${result.unassigned}.` +
              (skipped > 0 ? ` ${skipped} skipped — no longer active in this season.` : ""),
          );
        },
        onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save the roster.")),
      },
    );
  };

  const q = query.trim().toLowerCase();
  const rows = roster.data.filter(
    (r) => q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
  );

  return frame(
    <View className="flex-col gap-3">
      <SearchField value={query} onChangeText={setQuery} placeholder="Search students" />
      {rows.length === 0 ? (
        <EmptyState title="No matches" description="No student matches that search." />
      ) : (
        <GroupedList>
          {rows.map((r) => (
            <ListRow
              key={r.userId}
              title={r.name ?? r.email}
              subtitle={joinMeta([r.name ? r.email : null, groupName(choice(r))])}
              leading={
                <Avatar size="sm">
                  <AvatarFallback>{initialsOf(r.name, "?")}</AvatarFallback>
                </Avatar>
              }
              trailing={r.userId in draft ? <StatusChip tone="warn" label="Not saved" /> : undefined}
              chevron
              onPress={() => setEditing(r)}
            />
          ))}
        </GroupedList>
      )}
      <AssignSheet
        student={editing}
        current={editing ? choice(editing) : null}
        groups={groups.data}
        onClose={() => setEditing(null)}
        onPick={(groupId) => editing && pick(editing, groupId)}
        onRemove={
          seasonIsDraft && editing
            ? () => {
                setRemoving(editing);
                setEditing(null);
              }
            : undefined
        }
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove from season?"
        description={
          removing
            ? `${removing.name ?? removing.email} will come off ${seasonTitle}. You can add them again until it starts.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        pending={removePerson.isPending}
        onConfirm={() => {
          if (removing === null) return;
          const who = removing.name ?? removing.email;
          removePerson.mutate(
            { userId: removing.userId },
            {
              onSuccess: () => {
                setRemoving(null);
                setDraft((d) => {
                  const { [removing.userId]: _gone, ...rest } = d;
                  return rest;
                });
                toast.success(`${who} was removed from ${seasonTitle}.`);
              },
              onError: (err) => {
                setRemoving(null);
                toast.error(apiErrorMessage(err, "Couldn't remove them."));
              },
            },
          );
        }}
      />
    </View>,
    subtitle,
    <SaveBar
      label={
        changes.length === 0 ? "No changes to save" : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`
      }
      loading={save.isPending}
      disabled={changes.length === 0}
      onPress={onSave}
      hint={changes.length === 0 ? "Pick a group for a student to stage a change." : undefined}
    />,
  );
}
