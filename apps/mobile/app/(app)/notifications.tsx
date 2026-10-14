import { useRouter } from "expo-router";
import { Bell, BellOff } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";
import type { NotificationItem } from "@space/shared";

import { cn } from "../../src/design/lib/cn";
import { iconWithClassName } from "../../src/design/lib/icon";
import { PageHeader } from "../../src/design/layout/page-header";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { Badge, Button, Card, CardContent, EmptyState, Text } from "../../src/design/ui";
import {
  flattenNotifications,
  useMarkRead,
  useNotifications,
} from "../../src/hooks/use-notifications";
import { formatStampAgo } from "../../src/lib/format";
import { routeForTarget } from "../../src/lib/notification-route";

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

iconWithClassName(Bell);
function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  const isUnread = item.readAt === null;

  // v1 wraps the card in a Link only when there is a target; here the whole
  // card is pressable because a tap also marks it read (spec D2).
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: isUnread }} onPress={() => onPress(item)}>
      <Card>
        <CardContent className={cn("flex-row items-start gap-3 pt-4", isUnread && "border-l-4 border-info-500")}>
          <Bell size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <View className="flex-1 flex-col gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm font-medium">{item.title}</Text>
              <Badge variant="outline" textClassName="text-[10px]">
                {item.type.replace(/_/g, " ")}
              </Badge>
              {isUnread ? (
                <Badge variant="info" textClassName="text-[10px]">
                  New
                </Badge>
              ) : null}
            </View>
            {item.body ? <Text className="text-sm text-muted-foreground">{item.body}</Text> : null}
            <Text className="text-xs text-muted-foreground">{formatStampAgo(item.createdAt)}</Text>
          </View>
        </CardContent>
      </Card>
    </Pressable>
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
      <ShellFrame>
        <PageHeader title="Notifications" />
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </ShellFrame>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="gap-2 bg-brand-navy-50 px-4 pb-24 pt-4 dark:bg-background"
      data={items}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <PageHeader
          title="Notifications"
          description={`${unread} unread`}
          actions={
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={markRead.isPending}
              onPress={() => markRead.mutate({ all: true })}
            >
              Mark all read
            </Button>
          }
        />
      }
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
  );
}
