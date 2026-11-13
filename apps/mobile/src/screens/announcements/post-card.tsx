import { View } from "react-native";
import { Pressable } from "../../design/ui/pressable";
import Animated from "react-native-reanimated";
import type { AnnouncementListItem } from "@space/shared";

import { usePressDim } from "../../design/motion";
import { StatusChip, Text } from "../../design/ui";
import { AudienceChip } from "./audience-chip";
import { announcementMeta } from "./meta";

/** One post in the feed: a whole-card button that dims while pressed. "New" is a word, never colour alone. */
export function PostCard({ post, onPress }: { post: AnnouncementListItem; onPress: () => void }) {
  const press = usePressDim();
  const meta = announcementMeta(post);
  const pollLabel = post.hasPoll ? (post.pollClosed ? "Poll · Closed" : "Poll") : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[post.excerpt, pollLabel, post.isRead ? null : "New", meta].filter(Boolean).join(", ")}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="min-h-[44px] flex-col gap-2 rounded-group bg-surface px-4 py-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <AudienceChip audience={post.audience} seasonTitle={post.seasonTitle} />
            {pollLabel ? <StatusChip tone="neutral" label={pollLabel} /> : null}
            {post.isRead ? null : (
              <View className="flex-row items-center gap-1.5">
                <View className="size-2 rounded-full bg-primary" />
                <Text variant="caption" className="font-semibold text-primary">
                  New
                </Text>
              </View>
            )}
          </View>
          <Text variant="body" numberOfLines={4} className={post.isRead ? undefined : "font-semibold"}>
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
