import { useRouter } from "expo-router";
import { FlatList, Pressable } from "react-native";
import type { NotificationItem } from "@space/shared";

import {
  flattenNotifications,
  useMarkRead,
  useNotifications,
} from "../../src/hooks/use-notifications";
import { formatDate } from "../../src/lib/format";
import { routeForTarget } from "../../src/lib/notification-route";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * The inbox — one route for everybody.
 *
 * v1 had six byte-identical role pages whose only difference was a URL gate;
 * the body re-derived the viewer from the session and scoped to their own id,
 * so collapsing them loses no authorization because there never was any (R40).
 *
 * Reading this screen performs no write. Read state changes from a tap or from
 * "Mark all read", never from the list query resolving — ruling C6, spec D2.
 */
function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  const theme = useTheme();
  const isUnread = item.readAt === null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isUnread }}
      onPress={() => onPress(item)}
    >
      <Card
        style={{
          marginBottom: theme.spacing.sm,
          borderLeftWidth: isUnread ? 3 : 0,
          borderLeftColor: theme.colors.brand.navy[900],
        }}
      >
        <Text variant="heading">{item.title}</Text>
        {item.body ? (
          <Text variant="body" color={theme.colors.neutral[600]}>
            {item.body}
          </Text>
        ) : null}
        <Text variant="label" color={theme.colors.neutral[600]}>
          {formatDate(item.createdAt)}
          {isUnread ? " · Unread" : ""}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage } =
    useNotifications();
  const markRead = useMarkRead();

  const items = flattenNotifications(data?.pages);

  const handlePress = (item: NotificationItem) => {
    // Explicit: the user tapped. Already-read rows are skipped so a re-open
    // costs nothing (the endpoint is idempotent anyway — R44).
    if (item.readAt === null) markRead.mutate({ ids: [item.id] });

    const route = routeForTarget(item.target);
    if (route) router.push(route);
  };

  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load your notifications." onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <Button
        title="Mark all read"
        variant="secondary"
        onPress={() => markRead.mutate({ all: true })}
        loading={markRead.isPending}
      />
      {items.length === 0 ? (
        <EmptyState title="No notifications" message="You're all caught up." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <NotificationRow item={item} onPress={handlePress} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage) void fetchNextPage();
          }}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          style={{ marginTop: theme.spacing.sm }}
        />
      )}
    </Screen>
  );
}
