import { useState } from "react";
import { View } from "react-native";
import type { SeasonRosterRow } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import {
  Avatar,
  AvatarFallback,
  Button,
  EmptyState,
  GroupedList,
  ListRow,
  SearchField,
  toast,
} from "../../design/ui";
import { useSaveGroupAssignments, useSeasonRoster } from "../../hooks/use-group-admin";
import { useSeasonGroups } from "../../hooks/use-groups";
import { apiErrorMessage } from "../../lib/api-error";
import { initialsOf } from "../../lib/initials";
import { joinMeta } from "../../lib/join-meta";
import { AssignSheet, ROSTER_UNASSIGNED_LABEL } from "./assign-sheet";

/**
 * The season's roster (v1 roster-grid.tsx; spec 05 §9; G7): a row per ACTIVE
 * enrolment (C9) with the student's email and group. A row opens the assign
 * sheet; its write reports the server's WRITTEN counts, not the number sent
 * (R101/D-16.12). A student sitting in another season's group says so (R82).
 * V2-ONLY: the search box.
 */
export function RosterList({ seasonId, onNewGroup }: { seasonId: number; onNewGroup: () => void }) {
  const roster = useSeasonRoster(seasonId);
  const groups = useSeasonGroups(seasonId);
  const save = useSaveGroupAssignments(seasonId);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SeasonRosterRow | null>(null);

  if (roster.isPending || groups.isPending) return <RouteSkeleton />;
  if (roster.isError) return <RouteError onRetry={() => void roster.refetch()} />;
  if (groups.isError) return <RouteError onRetry={() => void groups.refetch()} />;
  if (roster.data.length === 0) {
    return (
      <EmptyState
        icon={NAV_ICONS.students}
        title="No students in this season"
        description="Students appear here once their active season is set for this season (e.g. via the profile import)."
      />
    );
  }
  if (groups.data.length === 0) {
    return (
      <EmptyState
        icon={NAV_ICONS.groups}
        title="No groups yet"
        description="Create at least one group before assigning students."
        action={<Button onPress={onNewGroup}>New group</Button>}
      />
    );
  }

  const onSave = (groupId: number | null) => {
    if (!editing) return;
    save.mutate(
      { assignments: [{ studentUserId: editing.userId, groupId }] },
      {
        onSuccess: (result) => {
          setEditing(null);
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
    (r) =>
      q === "" || (r.name ?? "").toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
  );

  return (
    <View className="flex-col gap-3">
      <SearchField value={query} onChangeText={setQuery} placeholder="Search students" />
      {rows.length === 0 ? (
        <EmptyState title="No matches" description="No student matches that search." />
      ) : (
        <GroupedList>
          {rows.map((r, i) => (
            <ListRow
              key={r.userId}
              index={i}
              title={r.name ?? r.email}
              subtitle={joinMeta([r.name ? r.email : null, r.groupName ?? ROSTER_UNASSIGNED_LABEL])}
              leading={
                <Avatar size="sm">
                  <AvatarFallback>{initialsOf(r.name, "?")}</AvatarFallback>
                </Avatar>
              }
              chevron
              onPress={() => setEditing(r)}
            />
          ))}
        </GroupedList>
      )}
      <AssignSheet
        student={editing}
        groups={groups.data}
        saving={save.isPending}
        onClose={() => setEditing(null)}
        onSave={onSave}
      />
    </View>
  );
}
