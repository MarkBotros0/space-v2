import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import type { AnnouncementListItem } from "@space/shared";

import { usePressDim } from "../../design/motion";
import { PillButton, Text } from "../../design/ui";
import { useAnnouncementUnread } from "../../hooks/use-announcements";
import { AudienceChip } from "./audience-chip";

/**
 * Home's Announcements card: the latest unread post, and how many more wait.
 * It is quiet by design: nothing while loading, on error or with nothing
 * unread (never a skeleton or an error on Home). Unread is said in words.
 */
export function AnnouncementsHomeCard() {
  const { data, isPending, isError } = useAnnouncementUnread();
  if (isPending || isError || !data || data.count === 0 || data.latest === null) return null;
  return <AnnouncementsHomeCardView count={data.count} latest={data.latest} />;
}

/** The card itself, from data in hand: the hook's wrapper above, and the design catalogue's fixed samples. */
export function AnnouncementsHomeCardView({
  count,
  latest,
}: {
  count: number;
  latest: AnnouncementListItem;
}) {
  const router = useRouter();
  const press = usePressDim();
  const unread = `${count} unread`;
  // The label replaces the children for a screen reader, so it must name the post it opens.
  const label = `Announcements, ${unread}. ${latest.title}${count > 1 ? `, and ${count - 1} more` : ""}`;

  return (
    <View className="flex-col gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="headline" className="min-w-0 flex-1">
          Announcements
        </Text>
        <PillButton label="See all" onPress={() => router.push("/announcements")} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() =>
          router.push({ pathname: "/announcements/[id]", params: { id: String(latest.id) } })
        }
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View style={press.animatedStyle}>
          <View className="min-h-[44px] flex-col gap-2 rounded-group bg-surface px-4 py-3">
            <View className="flex-row flex-wrap items-center gap-2">
              <AudienceChip audience={latest.audience} seasonTitle={latest.seasonTitle} />
              <Text variant="caption" className="font-semibold text-primary">
                {unread}
              </Text>
            </View>
            <Text variant="headline">{latest.title}</Text>
            <Text variant="body" numberOfLines={2} className="text-muted-foreground">
              {latest.excerpt}
            </Text>
            {count > 1 ? (
              <Text variant="caption" className="text-muted-foreground">
                {`and ${count - 1} more`}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}
