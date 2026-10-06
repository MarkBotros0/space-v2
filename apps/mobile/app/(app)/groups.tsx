import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { GroupListItem } from "@space/shared";

import { SeasonSwitcher } from "../../src/components/SeasonSwitcher";
import { SEASON_GROUPS_ROLES } from "../../src/hooks/use-group-admin";
import { MY_GROUPS_ROLES, useMyGroups, useSeasonGroups } from "../../src/hooks/use-groups";
import { useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function GroupRow({ group, subtitle }: { group: GroupListItem; subtitle: string }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{group.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>{subtitle}</Text>
      </Card>
    </Pressable>
  );
}

/** LEADER / STUDENT — Plan 2's branch, unchanged in behaviour. */
function MyGroups() {
  const { data, isPending, isError, refetch, isRefetching } = useMyGroups(true);
  return (
    <Screen edges={["top", "left", "right"]} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your groups. Check your connection and try again." onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No groups" message="You aren't in any groups yet." />
      ) : (
        <>
          {data.map((group) => (
            <GroupRow key={group.id} group={group} subtitle={`${group.seasonTitle} · ${group.studentCount} students`} />
          ))}
        </>
      )}
    </Screen>
  );
}

/**
 * ADMIN / SUPER — a season's groups with a season switcher (Plan 6
 * D-16.16; spec 05 §9). v1 forced one season with a redirect (R91) and
 * refused SUPER (R92); neither is ported.
 */
function SeasonGroups() {
  const theme = useTheme();
  const router = useRouter();
  const selection = useStaffSeasonSelection(true);
  const groups = useSeasonGroups(selection.seasonId);

  let body;
  if (selection.isPending) body = <LoadingState />;
  else if (selection.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={selection.refetch} />;
  else if (selection.season === null)
    body = <EmptyState title="No season" message="You aren't assigned to a season yet." />;
  else {
    const season = selection.season;
    body = (
      <>
        <SeasonSwitcher seasons={selection.seasons} selectedId={season.id} onSelect={selection.setSeasonId} />
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          <Button
            title="New group"
            variant="secondary"
            onPress={() => router.push({ pathname: "/group/new", params: { seasonId: String(season.id) } })}
          />
          <Button
            title="Roster"
            variant="secondary"
            onPress={() => router.push({ pathname: "/seasons/[code]/roster", params: { code: season.code } })}
          />
        </View>
        {groups.isPending ? (
          <LoadingState />
        ) : groups.isError ? (
          <ErrorState message="Couldn't load this season's groups." onRetry={() => void groups.refetch()} />
        ) : groups.data.length === 0 ? (
          <EmptyState title="No groups" message="This season has no groups yet." />
        ) : (
          groups.data.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              subtitle={g.leaderNames.length > 0 ? `${g.studentCount} students · ${g.leaderNames.join(", ")}` : `${g.studentCount} students`}
            />
          ))
        )}
      </>
    );
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => {
        if (selection.seasonId !== null) void groups.refetch();
        else selection.refetch();
      }}
      refreshing={groups.isRefetching}
    >
      {body}
    </Screen>
  );
}

export default function GroupsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  if (role !== null && SEASON_GROUPS_ROLES.includes(role)) return <SeasonGroups />;
  if (role !== null && MY_GROUPS_ROLES.includes(role)) return <MyGroups />;
  // MENTOR: no /groups in its nav, reachable by deep link (spec 05 §9).
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Groups" message="Groups aren't available for your role." />
    </Screen>
  );
}
