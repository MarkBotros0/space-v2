import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { GroupListItem } from "@space/shared";

import { SeasonSwitcher } from "../../components/SeasonSwitcher";
import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button, EmptyState, GroupedList, ListRow } from "../../design/ui";
import { useSeasonGroups } from "../../hooks/use-groups";
import { useStaffSeasonSelection } from "../../hooks/use-season-selection";
import { joinMeta } from "../../lib/join-meta";
import { countOf } from "../../lib/plural";

/** "3 students · Lina, Karim", or "No leaders" when nobody leads it. */
export function groupMeta(g: GroupListItem): string {
  return joinMeta([
    countOf(g.studentCount, "student"),
    g.leaderNames.length === 0 ? "No leaders" : g.leaderNames.join(", "),
  ]);
}

/**
 * ADMIN / SUPER — v1 app/admin/season/[code]/groups/page.tsx: "Groups",
 * "{n} groups in {season}", "Assign to groups" + "New group", and the groups
 * with their leaders and student counts. V2-ONLY kept: the season switcher
 * (Plan 6 D-16.16; spec 05 §9) — v1 forced one season with a redirect (R91)
 * and refused SUPER (R92); neither is ported. The actions sit under the
 * title in a wrapping row so the title never shares its line with them.
 */
export function AdminGroups() {
  const router = useRouter();
  const selection = useStaffSeasonSelection(true);
  const groups = useSeasonGroups(selection.seasonId);
  const season = selection.season;
  const rows = groups.data ?? [];

  const newGroup = () =>
    season && router.push({ pathname: "/group/new", params: { seasonId: String(season.id) } });

  let body: ReactNode;
  if (selection.isPending || (season !== null && groups.isPending)) body = <RouteSkeleton />;
  else if (selection.isError) body = <RouteError onRetry={selection.refetch} />;
  else if (season === null)
    body = <EmptyState title="No season" description="You aren't assigned to a season yet." />;
  else if (groups.isError) body = <RouteError onRetry={() => void groups.refetch()} />;
  else if (rows.length === 0)
    body = (
      <EmptyState
        icon={NAV_ICONS.groups}
        title="No groups yet"
        description="Create a group to organize students and assign leaders."
        action={<Button onPress={newGroup}>New group</Button>}
      />
    );
  else
    body = (
      <GroupedList>
        {rows.map((row, i) => (
          <ListRow
            key={row.id}
            index={i}
            title={row.name}
            subtitle={groupMeta(row)}
            chevron
            onPress={() =>
              router.push({ pathname: "/group/[id]", params: { id: String(row.id) } })
            }
          />
        ))}
      </GroupedList>
    );

  return (
    <Screen
      title="Groups"
      subtitle={
        season && groups.data ? `${countOf(rows.length, "group")} in ${season.title}` : undefined
      }
      refreshing={groups.isRefetching}
      onRefresh={() => {
        if (selection.seasonId !== null) void groups.refetch();
        else selection.refetch();
      }}
    >
      <View className="flex-col gap-4">
        {season ? (
          <View className="flex-row flex-wrap gap-2">
            <Button
              variant="secondary"
              onPress={() =>
                router.push({ pathname: "/seasons/[code]/roster", params: { code: season.code } })
              }
            >
              Assign to groups
            </Button>
            <Button onPress={newGroup}>New group</Button>
          </View>
        ) : null}
        <SeasonSwitcher
          seasons={selection.seasons}
          selectedId={selection.seasonId}
          onSelect={selection.setSeasonId}
        />
        {body}
      </View>
    </Screen>
  );
}
