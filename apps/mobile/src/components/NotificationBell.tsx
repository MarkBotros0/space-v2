import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { useUnreadCount } from "../hooks/use-notifications";
import { useTheme } from "../theme";
import { Text } from "../ui";
import { NavIcon } from "./NavIcon";

/**
 * The inbox's entry point and its badge.
 *
 * Rendered at the top of every screen under the tab shell for every role —
 * `(app)/_layout.tsx` provides it as the `Screen` header — as v1's app shell
 * (app-shell.tsx:55-57; R36).
 *
 * The count comes from its own endpoint on a slow poll, not from a list fetch
 * and not from `GET /me` (spec D11): v1 paid for eight rows plus a count on
 * every authenticated page render for every role, opened bell or not (R36).
 */
export function NotificationBell() {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useUnreadCount();
  const count = data ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      onPress={() => router.push("/notifications")}
      style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }}
    >
      <NavIcon name="notifications" color={theme.colors.neutral[900]} size={24} />
      {count > 0 ? (
        <View
          style={{
            minWidth: 20,
            paddingHorizontal: 6,
            borderRadius: 10,
            backgroundColor: theme.colors.error[600],
            alignItems: "center",
          }}
        >
          {/* Capped like v1's bell (R38) — the exact number stops being useful
              past a handful and the badge stops fitting. */}
          <Text variant="caption" color={theme.colors.white}>
            {count > 9 ? "9+" : String(count)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
