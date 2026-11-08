import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import type { AnnouncementListItem } from "@space/shared";

import { usePressDim } from "../../design/motion";
import { Text } from "../../design/ui";
import { AudienceChip } from "./audience-chip";
import { announcementMeta } from "./meta";

/** One post in the feed: a whole-card button that dims while pressed. "New" is a word, never colour alone. */
export function PostCard({ post, onPress }: { post: AnnouncementListItem; onPress: () => void }) {
  const press = usePressDim();
  const meta = announcementMeta(post);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[post.title, post.isRead ? null : "New", meta].filter(Boolean).join(", ")}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="min-h-[44px] flex-col gap-2 rounded-group bg-surface px-4 py-3">
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
          <Text variant="headline" className={post.isRead ? "font-normal" : undefined}>
            {post.title}
          </Text>
          <Text variant="body" numberOfLines={3} className="text-muted-foreground">
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
