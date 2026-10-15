import { useRouter } from "expo-router";
import { Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { GroupDetail, GroupListItem } from "@space/shared";

import { SeasonSwitcher } from "../../src/components/SeasonSwitcher";
import { SEASON_GROUPS_ROLES } from "../../src/hooks/use-group-admin";
import { Eyebrow, PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState as V1EmptyState,
  Text as V1Text,
} from "../../src/design/ui";
import { MY_GROUPS_ROLES, useGroupDetails, useMyGroups, useSeasonGroups } from "../../src/hooks/use-groups";
import { useSeasons } from "../../src/hooks/use-seasons";
import { useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card as LegacyCard, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function GroupRow({ group, subtitle }: { group: GroupListItem; subtitle: string }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
    >
      <LegacyCard style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{group.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>{subtitle}</Text>
      </LegacyCard>
    </Pressable>
  );
}

const byName = (a: GroupListItem, b: GroupListItem) => a.name.localeCompare(b.name);

/** One v1 group card: name, season, "Calendar →", and the members as links. */
function LeaderGroupCard({ group, detail }: { group: GroupListItem; detail: { data?: GroupDetail; isError: boolean } }) {
  const router = useRouter();
  const students = detail.data?.students ?? null;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <CardTitle className="text-base">{group.name}</CardTitle>
          <V1Text className="text-sm text-muted-foreground">{group.seasonTitle}</V1Text>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push("/calendar")}>
          {/* v1 has no dark: variant on this link. */}
          <V1Text className="text-sm font-medium text-brand-teal-700">Calendar →</V1Text>
        </Pressable>
      </CardHeader>
      <CardContent>
        {detail.isError ? (
          <V1Text className="text-sm italic text-muted-foreground">Couldn't load the members.</V1Text>
        ) : students === null ? null : students.length === 0 ? (
          <V1Text className="text-sm italic text-muted-foreground">No students yet.</V1Text>
        ) : (
          <View className="flex-col gap-1.5">
            {students.map((st) => (
              <Pressable
                key={st.id}
                accessibilityRole="link"
                className="self-start"
                onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(st.id) } })}
              >
                <V1Text className="text-sm text-foreground">{st.name ?? st.email ?? "Student"}</V1Text>
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
          <V1EmptyState icon={Users} title="No groups" description="An admin will add you to a group when you're ready." />
        </View>
      </ShellFrame>
    );
  }

  const active = new Set((seasons.data ?? []).filter((x) => x.status === "ACTIVE").map((x) => x.id));
  // Until the seasons load, every group counts as current.
  const isCurrent = (g: GroupListItem) => seasons.data === undefined || active.has(g.seasonId);
  const current = rows.filter(isCurrent).sort(byName);
  const past = rows.filter((g) => !isCurrent(g)).sort(byName);
  const card = (g: GroupListItem) => <LeaderGroupCard key={g.id} group={g} detail={details[rows.indexOf(g)] ?? { isError: false }} />;

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
          <PageTitle title="My groups" subtitle={`${rows.length} ${rows.length === 1 ? "group" : "groups"}`} />
          {rows.length === 0 ? (
            <V1EmptyState icon={Users} title="No groups" description="An admin will add you to a group when you're ready." />
          ) : (
            <View className="flex-col gap-4">
              {current.map(card)}
              {current.length > 0 && past.length > 0 ? <Eyebrow>Past seasons</Eyebrow> : null}
              {past.map(card)}
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
  if (role === "LEADER") return <LeaderGroups />;
  if (role !== null && MY_GROUPS_ROLES.includes(role)) return <MyGroups />;
  // MENTOR: no /groups in its nav, reachable by deep link (spec 05 §9).
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Groups" message="Groups aren't available for your role." />
    </Screen>
  );
}
