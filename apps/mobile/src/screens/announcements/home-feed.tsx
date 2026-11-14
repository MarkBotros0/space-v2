/**
 * Announcements as a news feed on Home (owner 2026-11-14), for the Homes with no season to fill
 * them: an alumnus, and a student between seasons. The newest few posts, read or not, each
 * opening its post, and See all for the rest. Quiet like the unread card: nothing while loading,
 * on error or with no posts.
 */
import { useRouter } from "expo-router";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import type { AnnouncementListItem } from "@space/shared";

import { directionStyle } from "../../design/lib/text-direction";
import { usePressDim } from "../../design/motion";
import { GroupedList, Text } from "../../design/ui";
import { Pressable } from "../../design/ui/pressable";
import { useAnnouncementFeed } from "../../hooks/use-announcements";
import { useRefreshOnResume } from "../../hooks/use-refresh-on-resume";
import { AudienceChip } from "./audience-chip";
import { announcementMeta } from "./meta";

const FEED_ROWS = 3;

function FeedRow({ post, onPress }: { post: AnnouncementListItem; onPress: () => void }) {
  const press = usePressDim();
  const meta = announcementMeta(post);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[post.excerpt, post.isRead ? null : "New", meta].filter(Boolean).join(", ")}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="min-h-[44px] flex-col gap-1.5 px-4 py-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <AudienceChip audience={post.audience} seasonTitle={post.seasonTitle} />
            {post.isRead ? null : (
              <View className="flex-row items-center gap-1.5">
                <View className="size-2 rounded-full bg-primary" />
                <Text variant="caption" className="font-semibold text-primary">
                  New
                </Text>
              </View>
            )}
          </View>
          <Text
            variant="body"
            numberOfLines={3}
            className={post.isRead ? undefined : "font-semibold"}
            style={directionStyle(post.excerpt)}
          >
            {post.excerpt}
          </Text>
          <Text variant="caption" className="text-muted-foreground">
            {meta}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function AnnouncementsHomeFeed() {
  const router = useRouter();
  const feed = useAnnouncementFeed();
  useRefreshOnResume(() => void feed.refetch({ cancelRefetch: false }));
  const posts = (feed.data?.pages[0]?.items ?? []).slice(0, FEED_ROWS);
  if (posts.length === 0) return null;
  return (
    <GroupedList
      header="Announcements"
      headerAction={{ label: "See all", onPress: () => router.push("/announcements") }}
    >
      {posts.map((p) => (
        <FeedRow
          key={p.id}
          post={p}
          onPress={() => router.push({ pathname: "/announcements/[id]", params: { id: String(p.id) } })}
        />
      ))}
    </GroupedList>
  );
}
