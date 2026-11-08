import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronRight, Megaphone } from "lucide-react-native";
import type { AnnouncementListItem } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { usePressDim } from "../../design/motion";
import { Text } from "../../design/ui";
import { useAnnouncementUnread } from "../../hooks/use-announcements";
import { useRefreshOnResume } from "../../hooks/use-refresh-on-resume";

iconWithClassName(ChevronRight, Megaphone);

/**
 * Home's Announcements card: the latest unread post, and how many more wait.
 * It is quiet by design: nothing while loading, on error or with nothing
 * unread (never a skeleton or an error on Home). Unread is said in words.
 */
export function AnnouncementsHomeCard() {
  const { data, isPending, isError, refetch } = useAnnouncementUnread();
  // Home tabs stay mounted: back on the screen or in the app, a post made meanwhile shows.
  useRefreshOnResume(() => void refetch({ cancelRefetch: false }));
  if (isPending || isError || !data || data.count === 0 || data.latest === null) return null;
  return <AnnouncementsHomeCardView count={data.count} latest={data.latest} />;
}

/**
 * The card itself, from data in hand: the hook's wrapper above, and the design catalogue's fixed samples.
 * One compact row (owner, 2026-11-08): it says a post is new in words, shows the latest post's first
 * line, and opens that post. The full feed stays on More.
 */
export function AnnouncementsHomeCardView({
  count,
  latest,
}: {
  count: number;
  latest: AnnouncementListItem;
}) {
  const router = useRouter();
  const press = usePressDim();
  const heading = count === 1 ? "New announcement" : `${count} new announcements`;
  // The label replaces the children for a screen reader, so it must name the post it opens.
  const label = `${heading}. ${latest.excerpt}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the announcement"
      onPress={() =>
        router.push({ pathname: "/announcements/[id]", params: { id: String(latest.id) } })
      }
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="min-h-[56px] flex-row items-center gap-3 rounded-group bg-surface px-4 py-2.5">
          <View className="size-9 shrink-0 items-center justify-center rounded-full bg-unread-soft">
            <Megaphone size={18} className="text-primary" />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="subhead" className="font-semibold text-foreground">
              {heading}
            </Text>
            <Text variant="subhead" numberOfLines={1} className="text-muted-foreground">
              {latest.excerpt}
            </Text>
          </View>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </View>
      </Animated.View>
    </Pressable>
  );
}
