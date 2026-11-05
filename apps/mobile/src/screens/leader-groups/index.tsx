import { useRouter } from "expo-router";
import { View } from "react-native";
import type { GroupDetail, GroupListItem } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow, ListSectionHeader } from "../../design/ui/grouped-list";
import { useGroupDetails, useMyGroups } from "../../hooks/use-groups";
import { useSeasons } from "../../hooks/use-seasons";
import { useSessionStore } from "../../store/session";

const GroupIcon = NAV_ICONS.groups;
const byName = (a: GroupListItem, b: GroupListItem) => a.name.localeCompare(b.name);
const NONE_DESCRIPTION = "An admin will add you to a group when you're ready.";

/** One group: its own row (opens the group), then its students (open the student). */
function GroupBlock({
  group,
  detail,
}: {
  group: GroupListItem;
  detail: { data?: GroupDetail; isError: boolean };
}) {
  const router = useRouter();
  const students = detail.data?.students ?? null;
  // The list's count is ACTIVE enrolments; the members listed are ACTIVE and COMPLETED.
  // Say what is listed once it has loaded, so the subtitle never disagrees with the rows.
  const count = students ? students.length : group.studentCount;
  return (
    <GroupedList header={group.seasonTitle}>
      <ListRow
        title={group.name}
        subtitle={`${count} ${count === 1 ? "student" : "students"}`}
        leading={<GroupIcon size={20} className="text-primary" />}
        chevron
        onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
      />
      {detail.isError ? (
        <ListRow title="Couldn't load the members." />
      ) : students === null ? null : students.length === 0 ? (
        <ListRow title="No students yet." />
      ) : (
        students.map((st) => (
          <ListRow
            key={st.id}
            title={st.name ?? st.email ?? "Student"}
            titleLines={2}
            className="pl-12"
            chevron
            onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(st.id) } })}
          />
        ))
      )}
    </GroupedList>
  );
}

/**
 * LEADER — v1 app/leader/groups/page.tsx. Members come from each group's
 * detail (B3-5: GET /groups rows carry only a count). Groups of past seasons
 * follow under their own header (spec 05 §9). A leader who leads nothing gets
 * no request at all (R87).
 */
export function LeaderGroups() {
  const leadsNothing = useSessionStore((s) => (s.scopes?.groupLeaderIds.length ?? 0) === 0);
  const groups = useMyGroups(!leadsNothing);
  const seasons = useSeasons(!leadsNothing);
  const rows = groups.data ?? [];
  const details = useGroupDetails(rows.map((g) => g.id));

  if (leadsNothing) {
    return (
      <Screen title="Groups" subtitle="You don't lead any groups yet.">
        <EmptyState icon={NAV_ICONS.groups} title="No groups" description={NONE_DESCRIPTION} />
      </Screen>
    );
  }

  // Past = a finished season; a DRAFT season being set up is upcoming, so it stays current.
  const past = new Set(
    (seasons.data ?? [])
      .filter((x) => x.status === "COMPLETED" || x.status === "ARCHIVED")
      .map((x) => x.id),
  );
  // Until the seasons load, every group counts as current.
  const isCurrent = (g: GroupListItem) => !past.has(g.seasonId);
  const current = rows.filter(isCurrent).sort(byName);
  const pastRows = rows.filter((g) => !isCurrent(g)).sort(byName);
  const block = (g: GroupListItem) => (
    <GroupBlock key={g.id} group={g} detail={details[rows.indexOf(g)] ?? { isError: false }} />
  );

  return (
    <Screen
      title="Groups"
      subtitle={groups.data ? `${rows.length} ${rows.length === 1 ? "group" : "groups"}` : undefined}
      refreshing={groups.isRefetching}
      onRefresh={() => {
        void groups.refetch();
        details.forEach((d) => void d.refetch());
      }}
    >
      {groups.isPending ? (
        <RouteSkeleton />
      ) : groups.isError ? (
        <RouteError onRetry={() => void groups.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={NAV_ICONS.groups} title="No groups" description={NONE_DESCRIPTION} />
      ) : (
        <View className="flex-col gap-4">
          {current.map(block)}
          {current.length > 0 && pastRows.length > 0 ? (
            <ListSectionHeader>Past seasons</ListSectionHeader>
          ) : null}
          {pastRows.map(block)}
        </View>
      )}
    </Screen>
  );
}
