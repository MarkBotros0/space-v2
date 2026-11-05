import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { GroupDetail, GroupListItem } from "@space/shared";

import { SeasonSwitcher } from "../../../src/components/SeasonSwitcher";
import { SEASON_GROUPS_ROLES } from "../../../src/hooks/use-group-admin";
import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { Eyebrow, PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Button,
  Text,
  type DataTableColumn,
} from "../../../src/design/ui";
import {
  MY_GROUPS_ROLES,
  useGroupDetails,
  useMyGroups,
  useSeasonGroups,
} from "../../../src/hooks/use-groups";
import { useSeasons } from "../../../src/hooks/use-seasons";
import { useStaffSeasonSelection } from "../../../src/hooks/use-season-selection";
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

const byName = (a: GroupListItem, b: GroupListItem) => a.name.localeCompare(b.name);

/** One v1 group card: name, season, "Calendar →", and the members as links. */
function LeaderGroupCard({
  group,
  detail,
}: {
  group: GroupListItem;
  detail: { data?: GroupDetail; isError: boolean };
}) {
  const router = useRouter();
  const students = detail.data?.students ?? null;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <CardTitle className="text-base">{group.name}</CardTitle>
          <Text className="text-sm text-muted-foreground">{group.seasonTitle}</Text>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push("/calendar")}>
          {/* v1 has no dark: variant on this link. */}
          <Text className="text-sm font-medium text-brand-teal-800 dark:text-brand-teal-300">Calendar →</Text>
        </Pressable>
      </CardHeader>
      <CardContent>
        {detail.isError ? (
          <Text className="text-sm italic text-muted-foreground">Couldn't load the members.</Text>
        ) : students === null ? null : students.length === 0 ? (
          <Text className="text-sm italic text-muted-foreground">No students yet.</Text>
        ) : (
          <View className="flex-col gap-1.5">
            {students.map((st) => (
              <Pressable
                key={st.id}
                accessibilityRole="link"
                className="self-start"
                onPress={() =>
                  router.push({ pathname: "/student/[id]", params: { id: String(st.id) } })
                }
              >
                <Text className="text-sm text-foreground">{st.name ?? st.email ?? "Student"}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * LEADER — v1 app/leader/groups/page.tsx. Members come from each group's
 * detail (B3-5: GET /groups rows carry only a count); the cards themselves
 * are not links (v1). Groups of past seasons follow under their own eyebrow
 * (spec 05 §9). A leader who leads nothing gets no request at all (R87).
 */
function LeaderGroups() {
  const leadsNothing = useSessionStore((s) => (s.scopes?.groupLeaderIds.length ?? 0) === 0);
  const groups = useMyGroups(!leadsNothing);
  const seasons = useSeasons(!leadsNothing);
  const rows = groups.data ?? [];
  const details = useGroupDetails(rows.map((g) => g.id));

  if (leadsNothing) {
    return (
      <ShellFrame>
        <View className="flex-col gap-4">
          <PageTitle title="My groups" subtitle="You don't lead any groups yet." />
          <EmptyState
            icon={NAV_ICONS.groups}
            title="No groups"
            description="An admin will add you to a group when you're ready."
          />
        </View>
      </ShellFrame>
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
  const card = (g: GroupListItem) => (
    <LeaderGroupCard key={g.id} group={g} detail={details[rows.indexOf(g)] ?? { isError: false }} />
  );

  return (
    <ShellFrame
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
      ) : (
        <View className="flex-col gap-4">
          <PageTitle
            title="My groups"
            subtitle={`${rows.length} ${rows.length === 1 ? "group" : "groups"}`}
          />
          {rows.length === 0 ? (
            <EmptyState
              icon={NAV_ICONS.groups}
              title="No groups"
              description="An admin will add you to a group when you're ready."
            />
          ) : (
            <View className="flex-col gap-4">
              {current.map(card)}
              {current.length > 0 && pastRows.length > 0 ? <Eyebrow>Past seasons</Eyebrow> : null}
              {pastRows.map(card)}
            </View>
          )}
        </View>
      )}
    </ShellFrame>
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
