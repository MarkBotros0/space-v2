import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import type { AuthoredNote } from "@space/shared";

import { listItemEntering, usePressScale, useReducedMotion } from "../../design/motion";
import { StatusChip, Text } from "../../design/ui";
import { formatDate } from "../../lib/format";
import { VISIBILITY_LABEL } from "../../lib/note-visibility";

/** One authored note as a grouped-list row: who, when and season, the body, then visibility. */
export function NoteRow({ item, index = 0 }: { item: AuthoredNote; index?: number }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const press = usePressScale(0.985);
  // One string, so a missing season can never leave a dangling separator (R33).
  const meta = [formatDate(item.createdAt), item.seasonTitle].filter(Boolean).join(" · ");

  return (
    <Animated.View entering={listItemEntering(index, reduced)}>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: "/student/[id]", params: { id: String(item.student.id) } })
        }
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View style={press.animatedStyle}>
          <View className="flex-col gap-1.5 px-4 py-3">
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
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
