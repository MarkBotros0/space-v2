/**
 * Who is in a season, as one card (owner, 2026-11-07: the Admins card, the
 * Students and groups tile and the Groups list merged): a hierarchy read top to
 * bottom, admins, then the students and the two ways to add them (Select from
 * community, Invite new), then each group with its leaders and the students in
 * it, and last the students in no group. Each group opens; the card's own actions
 * are pills on its level headers and one button at the foot.
 */
import type { SeasonDetail, SeasonRosterRow } from "@space/shared";
import { ChevronRight, FolderOpen, ShieldCheck, Users } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { initialsOf } from "../../lib/initials";
import { iconWithClassName } from "../lib/icon";
import { usePressDim } from "../motion";
import { Button } from "../ui/button";
import { MorePill, PersonPill } from "../ui/person-pill";
import { PillButton } from "../ui/pill-button";
import { Text } from "../ui/text";
import { LevelHeader } from "./level-header";
import { StudentsLevel, type StudentsSuggestion } from "./students-level";

iconWithClassName(ChevronRight, FolderOpen, ShieldCheck, Users);

/** Students shown under a group before "+N more"; the full list is one tap away. */
const STUDENTS_SHOWN = 6;

type Group = SeasonDetail["groups"][number];

export type PeopleCardAdmins =
  | { state: "loading" | "error" }
  | { state: "ready"; names: string[] };

function Muted({ children }: { children: string }) {
  return (
    <Text variant="subhead" className="text-muted-foreground">
      {children}
    </Text>
  );
}

function StudentPills({ students }: { students: { id: number; name: string }[] }) {
  const shown = students.slice(0, STUDENTS_SHOWN);
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {shown.map((s) => (
        <PersonPill key={s.id} name={s.name} initials={initialsOf(s.name, "?")} />
      ))}
      {students.length > shown.length ? <MorePill count={students.length - shown.length} /> : null}
    </View>
  );
}

function studentsLine(count: number): string {
  if (count === 0) return "No students yet";
  return count === 1 ? "1 student" : `${count} students`;
}

/** One group, indented under Groups by a rule: name, leaders, its students. */
function GroupBranch({
  group,
  students,
  onOpen,
}: {
  group: Group;
  /** Null while the roster isn't readable here: the count stands in. */
  students: { id: number; name: string }[] | null;
  onOpen?: () => void;
}) {
  const press = usePressDim();
  const leaders = group.leaderNames.length
    ? `${group.leaderNames.length > 1 ? "Leaders" : "Leader"}: ${group.leaderNames.join(", ")}`
    : "No leader yet";
  const body = (
    <View className="ml-4 flex-col gap-2 border-l-2 border-separator py-1 pl-4">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="body" numberOfLines={2} className="font-semibold">
            {group.name}
          </Text>
          <Text variant="subhead" numberOfLines={3} className="text-muted-foreground">
            {leaders}
          </Text>
        </View>
        {onOpen ? <ChevronRight size={18} className="shrink-0 text-muted-foreground" /> : null}
      </View>
      {students === null || students.length === 0 ? (
        <Muted>{studentsLine(students === null ? group.studentCount : 0)}</Muted>
      ) : (
        <StudentPills students={students} />
      )}
    </View>
  );
  if (!onOpen) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${leaders}, ${studentsLine(students?.length ?? group.studentCount)}`}
      onPress={onOpen}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>{body}</Animated.View>
    </Pressable>
  );
}

const named = (r: SeasonRosterRow) => ({ id: r.userId, name: r.name ?? r.email });

export function PeopleCard({
  seasonTitle,
  groups,
  studentCount,
  admins,
  roster,
  onSelectFromCommunity,
  onInviteNew,
  suggestion,
  onManageAdmins,
  onOpenGroup,
  onNewGroup,
  onMoveStudents,
}: {
  groups: Group[];
  studentCount: number;
  /** Absent when the viewer can't read the admins (only Super can). */
  admins?: PeopleCardAdmins;
  /** The season's roster, when the viewer administers it; else counts only. */
  roster?: SeasonRosterRow[];
  seasonTitle: string;
  /** The two ways in (owner, 2026-11-07); absent when the viewer can't add people or the season has finished. */
  onSelectFromCommunity?: () => void;
  onInviteNew?: () => void;
  /** A draft's "N people passed <last season>" callout. */
  suggestion?: StudentsSuggestion | null;
  onManageAdmins?: () => void;
  onOpenGroup?: (id: number) => void;
  onNewGroup?: () => void;
  onMoveStudents?: () => void;
}) {
  const byGroup = (id: number) =>
    roster ? roster.filter((r) => r.groupId === id).map(named) : null;
  const ungrouped = roster
    ? roster.filter((r) => r.groupId === null || !groups.some((g) => g.id === r.groupId)).map(named)
    : null;
  const ungroupedCount =
    ungrouped?.length ??
    Math.max(0, studentCount - groups.reduce((sum, g) => sum + g.studentCount, 0));

  let adminBody: ReactNode = null;
  if (admins?.state === "loading") adminBody = <Muted>Loading…</Muted>;
  else if (admins?.state === "error") adminBody = <Muted>Couldn't load the admins.</Muted>;
  else if (admins?.state === "ready")
    adminBody =
      admins.names.length === 0 ? (
        <Muted>No admins yet.</Muted>
      ) : (
        <View className="flex-row flex-wrap gap-1.5">
          {admins.names.map((name, i) => (
            <PersonPill key={`${name}-${i}`} name={name} initials={initialsOf(name, "?")} />
          ))}
        </View>
      );

  return (
    <View testID="people-card" className="flex-col gap-4 rounded-group bg-surface p-4">
      {admins ? (
        <>
          <View className="flex-col gap-2">
            <LevelHeader
              icon={ShieldCheck}
              title="Admins"
              action={
                onManageAdmins ? (
                  <PillButton
                    label="Manage"
                    accessibilityLabel="Manage admins"
                    onPress={onManageAdmins}
                  />
                ) : undefined
              }
            />
            <View className="ml-12">{adminBody}</View>
          </View>
          <View className="h-px bg-separator" />
        </>
      ) : null}
      <StudentsLevel
        seasonTitle={seasonTitle}
        count={studentCount}
        ungrouped={ungroupedCount}
        groups={groups.length}
        onSelectFromCommunity={onSelectFromCommunity}
        onInviteNew={onInviteNew}
        suggestion={suggestion}
      />
      <View className="h-px bg-separator" />
      <View className="flex-col gap-3">
        <LevelHeader
          icon={FolderOpen}
          title={`Groups (${groups.length})`}
          action={onNewGroup ? <PillButton label="New group" onPress={onNewGroup} /> : undefined}
        />
        {groups.length === 0 ? (
          <View className="ml-12">
            <Muted>No groups yet.</Muted>
          </View>
        ) : (
          groups.map((g) => (
            <GroupBranch
              key={g.id}
              group={g}
              students={byGroup(g.id)}
              onOpen={onOpenGroup ? () => onOpenGroup(g.id) : undefined}
            />
          ))
        )}
      </View>
      {ungroupedCount > 0 ? (
        <>
          <View className="h-px bg-separator" />
          <View className="flex-col gap-2">
            <LevelHeader icon={Users} title={`Not in a group (${ungroupedCount})`} />
            <View className="ml-12">
              {ungrouped ? (
                <StudentPills students={ungrouped} />
              ) : (
                <Muted>{studentsLine(ungroupedCount)}</Muted>
              )}
            </View>
          </View>
        </>
      ) : null}
      {onMoveStudents && studentCount > 0 && groups.length > 0 ? (
        <Button variant="secondary" onPress={onMoveStudents}>
          Move students between groups
        </Button>
      ) : null}
    </View>
  );
}
