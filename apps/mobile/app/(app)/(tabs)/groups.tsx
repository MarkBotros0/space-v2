import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { GroupListItem } from "@space/shared";

import { SeasonSwitcher } from "../../../src/components/SeasonSwitcher";
import { SEASON_GROUPS_ROLES } from "../../../src/hooks/use-group-admin";
import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import {
  Card,
  DataTable,
  EmptyState,
  Button,
  Text,
  type DataTableColumn,
} from "../../../src/design/ui";
import {
  MY_GROUPS_ROLES,
  useMyGroups,
  useSeasonGroups,
} from "../../../src/hooks/use-groups";
import { useStaffSeasonSelection } from "../../../src/hooks/use-season-selection";
import { LeaderGroups } from "../../../src/screens/leader-groups";
import { useSessionStore } from "../../../src/store/session";

function GroupRow({ group, subtitle }: { group: GroupListItem; subtitle: string }) {
  const router = useRouter();
  return (
    <Card
      className="p-4"
      onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
    >
      <Text className="text-lg font-semibold">{group.name}</Text>
      <Text className="text-sm font-medium text-muted-foreground">{subtitle}</Text>
    </Card>
  );
}

/** STUDENT — deep link only, no v1 page; unchanged until the batch-6 cleanup (B3-5). */
function MyGroups() {
  const { data, isPending, isError, refetch, isRefetching } = useMyGroups(true);
  return (
    <ShellFrame onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={NAV_ICONS.groups}
          title="No groups"
          description="You aren't in any groups yet."
        />
      ) : (
        <View className="flex-col gap-2">
          {data.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              subtitle={`${group.seasonTitle} · ${group.studentCount} students`}
            />
          ))}
        </View>
      )}
    </ShellFrame>
  );
}

/**
 * ADMIN / SUPER — v1 app/admin/season/[code]/groups/page.tsx: "Groups",
 * "{n} groups in {season}", "Assign to groups" + "New group", and a table of
 * Group / Leaders / Students. V2-ONLY kept: the season switcher (Plan 6
 * D-16.16; spec 05 §9) — v1 forced one season with a redirect (R91) and
 * refused SUPER (R92); neither is ported.
 */
function SeasonGroups() {
  const router = useRouter();
  const selection = useStaffSeasonSelection(true);
  const groups = useSeasonGroups(selection.seasonId);
  const season = selection.season;
  const rows = groups.data ?? [];

  const columns: DataTableColumn<GroupListItem>[] = [
    {
      key: "name",
      header: "Group",
      cell: (row) => (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(row.id) } })}
        >
          <Text className="font-medium text-foreground">{row.name}</Text>
        </Pressable>
      ),
    },
    {
      key: "leaders",
      header: "Leaders",
      cell: (row) =>
        row.leaderNames.length === 0 ? (
          <Text className="text-xs italic text-muted-foreground">No leaders</Text>
        ) : (
          <Text className="text-xs text-muted-foreground">{row.leaderNames.join(", ")}</Text>
        ),
    },
    { key: "students", header: "Students", cell: (row) => String(row.studentCount) },
  ];
  const newGroup = () =>
    season && router.push({ pathname: "/group/new", params: { seasonId: String(season.id) } });

  let body: ReactNode;
  if (selection.isPending || (season !== null && groups.isPending)) body = <RouteSkeleton />;
  else if (selection.isError) body = <RouteError onRetry={selection.refetch} />;
  else if (season === null)
    body = <EmptyState title="No season" description="You aren't assigned to a season yet." />;
  else if (groups.isError) body = <RouteError onRetry={() => void groups.refetch()} />;
  else
    body = (
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyState={
          <EmptyState
            icon={NAV_ICONS.groups}
            title="No groups yet"
            description="Create a group to organize students and assign leaders."
            action={<Button onPress={newGroup}>New group</Button>}
          />
        }
      />
    );

  return (
    <ShellFrame
      refreshing={groups.isRefetching}
      onRefresh={() => {
        if (selection.seasonId !== null) void groups.refetch();
        else selection.refetch();
      }}
    >
      <View className="flex-col gap-4">
        <View className="flex-row items-start justify-between gap-4">
          <PageTitle
            className="min-w-0 flex-1"
            title="Groups"
            subtitle={
              season && groups.data
                ? `${rows.length} ${rows.length === 1 ? "group" : "groups"} in ${season.title}`
                : undefined
            }
          />
          {season ? (
            <View className="shrink-0 flex-col gap-2">
              <Button
                variant="outline"
                onPress={() =>
                  router.push({ pathname: "/seasons/[code]/roster", params: { code: season.code } })
                }
              >
                Assign to groups
              </Button>
              <Button onPress={newGroup}>New group</Button>
            </View>
          ) : null}
        </View>
        <SeasonSwitcher
          seasons={selection.seasons}
          selectedId={selection.seasonId}
          onSelect={selection.setSeasonId}
        />
        {body}
      </View>
    </ShellFrame>
  );
}

export default function GroupsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  if (role !== null && SEASON_GROUPS_ROLES.includes(role)) return <SeasonGroups />;
  if (role === "LEADER") return <LeaderGroups />;
  if (role !== null && MY_GROUPS_ROLES.includes(role)) return <MyGroups />;
  // MENTOR: no /groups in its nav, reachable by deep link (spec 05 §9).
  return (
    <ShellFrame>
      <EmptyState
        icon={NAV_ICONS.groups}
        title="Groups"
        description="Groups aren't available for your role."
      />
    </ShellFrame>
  );
}
