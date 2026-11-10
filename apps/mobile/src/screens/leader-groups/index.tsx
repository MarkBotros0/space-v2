import { isSeasonFinished } from "@space/shared";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { GroupDetail, GroupListItem } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { LocalStudentList } from "../students-list/local-student-list";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { Text } from "../../design/ui/text";
import { useGroupDetails, useMyGroups } from "../../hooks/use-groups";
import { useSeasons } from "../../hooks/use-seasons";
import { useSessionStore } from "../../store/session";
import { plural } from "../../lib/plural";

const GroupIcon = NAV_ICONS.groups;
const byName = (a: GroupListItem, b: GroupListItem) => a.name.localeCompare(b.name);
const NONE_DESCRIPTION = "An admin will add you to a group when you're ready.";
/** The group a leader serves now: a card that opens it, then its students, searchable. */
function CurrentGroup({ group, detail }: { group: GroupListItem; detail: { data?: GroupDetail; isError: boolean } }) {
  const router = useRouter();
  const students = detail.data?.students ?? null;
  // The list's count is ACTIVE enrolments; the members listed are ACTIVE and COMPLETED.
  const count = students ? students.length : group.studentCount;
  return (
    <View className="flex-col gap-4">
      <GroupedList>
        <ListRow
          title={group.name}
          subtitle={`${group.seasonTitle} · ${plural(count, "student")}`}
          leading={
            <View className="size-11 items-center justify-center rounded-full bg-info-soft">
              <GroupIcon size={22} className="text-info" />
            </View>
          }
          chevron
          onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
        />
      </GroupedList>
      {detail.isError ? (
        <Text variant="subhead" className="px-1 text-muted-foreground">
          Couldn't load the students. Pull to try again.
        </Text>
      ) : students === null ? null : (
        <LocalStudentList
          header="Students"
          items={students.map((st) => ({ id: st.id, name: st.name ?? st.email ?? "Student" }))}
          emptyDescription="No students in this group yet."
          onPress={(st) => router.push({ pathname: "/student/[id]", params: { id: String(st.id) } })}
        />
      )}
    </View>
  );
}

/**
 * LEADER's "My group" tab (owner, 2026-11-07: "Groups" listing students was
 * misleading). The group they serve now as a card, then its students with
 * search and paging; groups of finished seasons follow as rows that open the
 * group (spec 05 §9). Members come from each group's detail (B3-5). A leader
 * who leads nothing gets no request at all (R87).
 */
export function LeaderGroups() {
  const router = useRouter();
  const leadsNothing = useSessionStore((s) => (s.scopes?.groupLeaderIds.length ?? 0) === 0);
  const groups = useMyGroups(!leadsNothing);
  const seasons = useSeasons(!leadsNothing);
  const rows = groups.data ?? [];
  const details = useGroupDetails(rows.map((g) => g.id));

  if (leadsNothing) {
    return (
      <Screen title="My group" subtitle="You don't lead a group yet.">
        <EmptyState icon={NAV_ICONS.groups} title="No group" description={NONE_DESCRIPTION} />
      </Screen>
    );
  }

  // Past = a finished season; a DRAFT season being set up is upcoming, so it stays current.
  const past = new Set((seasons.data ?? []).filter((x) => isSeasonFinished(x.status)).map((x) => x.id));
  // Until the seasons load, every group counts as current.
  const isCurrent = (g: GroupListItem) => !past.has(g.seasonId);
  const current = rows.filter(isCurrent).sort(byName);
  const pastRows = rows.filter((g) => !isCurrent(g)).sort(byName);

  return (
    <Screen
      title="My group"
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
        <EmptyState icon={NAV_ICONS.groups} title="No group" description={NONE_DESCRIPTION} />
      ) : (
        <View className="flex-col gap-6">
          {current.map((g) => (
            <CurrentGroup key={g.id} group={g} detail={details[rows.indexOf(g)] ?? { isError: false }} />
          ))}
          {pastRows.length > 0 ? (
            <GroupedList header="Past groups">
              {pastRows.map((g) => (
                <ListRow
                  key={g.id}
                  title={g.name}
                  subtitle={g.seasonTitle}
                  chevron
                  onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(g.id) } })}
                />
              ))}
            </GroupedList>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
