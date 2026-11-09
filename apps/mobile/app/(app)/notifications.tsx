import { useRouter } from "expo-router";
import { BellOff, Settings } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";
import type { NotificationItem } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { Screen } from "../../src/design/layout/screen";
import { EmptyState, PillButton } from "../../src/design/ui";
import { iconWithClassName } from "../../src/design/lib/icon";
import { Text } from "../../src/design/ui/text";
import { GroupedList, ListRow } from "../../src/design/ui/grouped-list";
import { flattenNotifications, useMarkRead, useNotifications } from "../../src/hooks/use-notifications";
import { formatStampAgo, notificationTypeLabel } from "../../src/lib/format";
import { joinMeta } from "../../src/lib/join-meta";
import { routeForTarget } from "../../src/lib/notification-route";

iconWithClassName(Settings);

/**
 * The inbox — one route for everybody.
 *
 * v1 had six byte-identical role pages whose only difference was a URL gate;
 * the body re-derived the viewer from the session and scoped to their own id,
 * so collapsing them loses no authorization because there never was any (R40).
 *
 * Reading this screen performs no write. Read state changes from a tap or from
 * "Mark all read", never from the list query resolving — ruling C6, spec D2.
 * Layout is v1's app/(notifications)/notifications-page.tsx.
 */

/** Wide enough to keep the text column aligned between unread and read rows. */
function UnreadDot({ unread }: { unread: boolean }) {
  return <View className={unread ? "size-2.5 rounded-full bg-info" : "size-2.5"} />;
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: (item: NotificationItem) => void }) {
  const isUnread = item.readAt === null;
  // The whole row is pressable because a tap also marks it read (spec D2). The
  // dot is colour only, so an unread row says "Unread" through trailingLabel.
  return (
    <GroupedList>
      <ListRow
        title={item.title}
        titleLines={2}
        subtitle={joinMeta([item.body, notificationTypeLabel(item.type), formatStampAgo(item.createdAt)])}
        subtitleLines={4}
        leading={<UnreadDot unread={isUnread} />}
        trailingLabel={isUnread ? "Unread" : undefined}
        onPress={() => onPress(item)}
      />
    </GroupedList>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching, fetchNextPage, hasNextPage } = useNotifications();
  const markRead = useMarkRead();

  const items = flattenNotifications(data?.pages);
  // The API pages by cursor and has no total, so v1's "X unread of Y" keeps
  // only its first half (gap note).
  const unread = data?.pages[0]?.unreadCount ?? 0;

  const handlePress = (item: NotificationItem) => {
    // Explicit: the user tapped. Already-read rows are skipped so a re-open
    // costs nothing (the endpoint is idempotent anyway — R44).
    if (item.readAt === null) markRead.mutate({ ids: [item.id] });

    const route = routeForTarget(item.target);
    if (route) router.push(route);
  };

  if (isPending || isError) {
    return (
      <Screen title="Notifications">
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  // The list is the screen's own scroller (infinite scroll, pull to refresh),
  // so Screen frames it without a second ScrollView.
  return (
    <Screen title="Notifications" scroll={false}>
      {/* Not in Screen's trailing: beside the large title it squeezed "Notifications" mid-word at 1.3x. */}
      <View className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <Text variant="subhead" className="text-muted-foreground">
          {`${unread} unread`}
        </Text>
        <View className="flex-row items-center gap-2">
          {unread > 0 ? <PillButton label="Mark all read" onPress={() => markRead.mutate({ all: true })} /> : null}
          {/* Notification settings live here, not on More (owner, 2026-11-07). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            onPress={() => router.push("/settings/notifications")}
            className="size-11 items-center justify-center rounded-full active:bg-muted"
          >
            <Settings size={22} className="text-muted-foreground" />
          </Pressable>
        </View>
      </View>
      <FlatList
        className="flex-1"
        contentContainerClassName="gap-2"
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          <EmptyState
            icon={BellOff}
            title="No notifications"
            description="Activity that involves you will appear here."
          />
        }
        renderItem={({ item }) => <NotificationRow item={item} onPress={handlePress} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage) void fetchNextPage();
        }}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
      />
    </Screen>
  );
}
