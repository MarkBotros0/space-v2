/**
 * The notification bell in Home's title row: a button that opens the
 * Notifications screen (owner, 2026-11-07: no dropdown). The count badge caps
 * at 9+ and is a circle (18pt; only "9+" widens it); the button's label
 * carries the full count for screen readers. The count is white on error-600
 * (4.8:1).
 */
import { Bell } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { Text } from "../ui/text";

iconWithClassName(Bell);

export function NotificationBell({ unread, onPress }: { unread: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      hitSlop={4}
      onPress={onPress}
      className="relative size-11 items-center justify-center rounded-full active:bg-muted"
    >
      <Bell size={22} className="text-muted-foreground" />
      {unread > 0 ? (
        <View
          testID="bell-count"
          className="absolute right-0.5 top-0.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error-600 px-1"
        >
          {/* 10px, under the caption floor, accepted with the tab labels (M6): a count badge
              inside a 44px button; the button's label carries the count for screen readers. */}
          <Text className="text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
