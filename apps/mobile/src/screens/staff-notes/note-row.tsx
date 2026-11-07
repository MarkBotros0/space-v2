import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import type { AuthoredNote } from "@space/shared";

import { usePressDim } from "../../design/motion";
import { StatusChip, Text } from "../../design/ui";
import { formatDate } from "../../lib/format";
import { VISIBILITY_LABEL } from "../../lib/note-visibility";

/**
 * One authored note as a grouped-list row: who, when and season, the body, then
 * visibility. `byAuthor` (the mentor's list, owner 2026-11-07) names the author
 * in place of the season: a mentor reads everyone's notes and sees no seasons.
 */
export function NoteRow({ item, byAuthor = false }: { item: AuthoredNote; byAuthor?: boolean }) {
  const router = useRouter();
  const press = usePressDim();
  // One string, so a missing season can never leave a dangling separator (R33).
  const meta = [formatDate(item.createdAt), byAuthor ? item.authorName : item.seasonTitle]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/student/[id]", params: { id: String(item.student.id) } })
      }
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.animatedStyle}>
        <View className="flex-row items-center gap-3 px-4 py-3">
          <View className="min-w-0 flex-1 flex-col gap-1.5">
            <Text variant="body" className="font-semibold">
              {item.student.name}
            </Text>
            <Text variant="caption" className="text-muted-foreground">
              {meta}
            </Text>
            <Text variant="body">{item.body}</Text>
            {item.followUpFlagged ? (
              <StatusChip tone="warn" label="Follow-up flagged" className="self-start" />
            ) : null}
            <Text variant="caption" className="text-muted-foreground">
              {VISIBILITY_LABEL[item.visibility]}
            </Text>
            {/* Server-derived (ruling C4): the client never compares timestamps. */}
            {item.edited ? (
              <Text variant="caption" className="text-muted-foreground">
                Edited
              </Text>
            ) : null}
          </View>
          <ChevronRight testID="list-row-chevron" size={16} className="text-muted-foreground" />
        </View>
      </Animated.View>
    </Pressable>
  );
}
