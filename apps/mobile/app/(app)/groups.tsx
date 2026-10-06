import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { GroupListItem } from "@space/shared";

import { MY_GROUPS_ROLES, useMyGroups } from "../../src/hooks/use-groups";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

function GroupRow({ group }: { group: GroupListItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/group/[id]", params: { id: String(group.id) } })}
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{group.name}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${group.seasonTitle} · ${group.studentCount} students`}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function GroupsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const servesRole = role !== null && MY_GROUPS_ROLES.includes(role);
  const { data, isPending, isError, refetch, isRefetching } = useMyGroups(servesRole);

  if (!servesRole) {
    // ADMIN/SUPER browse groups by season; that branch lands in Plan 6 on
    // Plan 4's useCurrentSeasonId (ruling X8).
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Groups" message="Browsing a season's groups isn't available in the app yet." />
      </Screen>
    );
  }

  return (
    <Screen
      edges={["top", "left", "right"]}
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
    >
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load your groups. Check your connection and try again." onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title="No groups" message="You aren't in any groups yet." />
      ) : (
        <>
          {data.map((group) => (
            <GroupRow key={group.id} group={group} />
          ))}
        </>
      )}
    </Screen>
  );
}
