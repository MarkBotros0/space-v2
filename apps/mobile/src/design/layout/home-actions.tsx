/**
 * The notification bell and the avatar in Home's title row (`Screen home`,
 * ruling R13): the bell opens Notifications and the avatar opens Profile
 * settings, both screens, no dropdowns (owner, 2026-11-07). The dev user
 * switcher joins them when the backend enables it.
 */
import { useRouter } from "expo-router";
import { View } from "react-native";

import { useUnreadCount } from "../../hooks/use-notifications";
import { initialsOf } from "../../lib/initials";
import { useSessionStore } from "../../store/session";
import { DevUserSwitcher } from "./dev-user-switcher";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function HomeActions() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const { data: unread = 0 } = useUnreadCount();
  if (!user) return null;

  const name = user.name?.trim() || null;
  return (
    <View className="shrink-0 flex-row items-center gap-1">
      {/* v1 parity: shows only on a DEV_USER_SWITCHER=1 backend. */}
      <DevUserSwitcher />
      <NotificationBell unread={unread} onPress={() => router.push("/notifications")} />
      <UserMenu initials={initialsOf(name, user.role.charAt(0))} onPress={() => router.push("/profile")} />
    </View>
  );
}
