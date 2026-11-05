import { useRouter } from "expo-router";
import { View } from "react-native";
import type { GroupListItem } from "@space/shared";

import { SEASON_GROUPS_ROLES } from "../../../src/hooks/use-group-admin";
import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import {
  Card,
  EmptyState,
  Text,
} from "../../../src/design/ui";
import {
  MY_GROUPS_ROLES,
  useMyGroups,
} from "../../../src/hooks/use-groups";
import { AdminGroups } from "../../../src/screens/groups-admin";
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

export default function GroupsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  if (role !== null && SEASON_GROUPS_ROLES.includes(role)) return <AdminGroups />;
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
