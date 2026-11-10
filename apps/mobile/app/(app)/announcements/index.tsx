import { View } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";

import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { queryStateView } from "../../../src/design/layout/route-states";
import { Screen } from "../../../src/design/layout/screen";
import { iconWithClassName } from "../../../src/design/lib/icon";
import { Button, EmptyState } from "../../../src/design/ui";
import { useAnnouncementFeed, useAnnouncementTargets } from "../../../src/hooks/use-announcements";
import { usePullRefresh } from "../../../src/hooks/use-pull-refresh";
import { PostCard } from "../../../src/screens/announcements/post-card";
import { LoadMoreButton } from "../../../src/design/ui/load-more-button";

iconWithClassName(Plus);

/** /announcements: the feed, newest first, 20 at a time behind "Load more". New post shows only to someone who can post somewhere. */
export default function AnnouncementsScreen() {
  const router = useRouter();
  const feed = useAnnouncementFeed();
  const targets = useAnnouncementTargets(true);
  const pull = usePullRefresh(() => Promise.all([feed.refetch(), targets.refetch()]));
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const canPost = !!targets.data && (targets.data.community || targets.data.seasons.length > 0);

  let body;
  const feedState = queryStateView(feed);
  if (feedState) body = feedState;
  else if (items.length === 0)
    body = (
      <EmptyState
        icon={NAV_ICONS.announcements}
        title="No announcements yet"
        description={canPost ? `Post something for ${targets.data?.community ? "everyone" : "your season"}` : undefined}
        action={canPost ? { label: "New announcement", onPress: () => router.push("/announcements/new") } : undefined}
      />
    );
  else
    body = (
      <View className="flex-col gap-3">
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onPress={() => router.push({ pathname: "/announcements/[id]", params: { id: String(post.id) } })}
          />
        ))}
        <LoadMoreButton query={feed} loadingLabel="Loading…" className="self-center" />
      </View>
    );

  return (
    <Screen
      title="Announcements"
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      trailing={
        canPost ? (
          <Button onPress={() => router.push("/announcements/new")}>
            <Plus size={16} className="text-primary-foreground" />
            New post
          </Button>
        ) : undefined
      }
    >
      {body}
    </Screen>
  );
}
