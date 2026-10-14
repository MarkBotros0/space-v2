/**
 * v1's top bar wired to the app: role, name and initials from the session,
 * the bell from the notification hooks (v1 shows the latest items, marks all
 * read, links to the notifications page), the user menu's theme toggle and
 * sign-out. v1's PROFILE_HREF: students → profile, every other role → settings.
 */
import { useRouter } from "expo-router";

import { flattenNotifications, useMarkRead, useNotifications, useUnreadCount } from "../../hooks/use-notifications";
import { useLogout } from "../../hooks/use-session";
import { initialsOf } from "../../lib/initials";
import { routeForTarget } from "../../lib/notification-route";
import { useSessionStore } from "../../store/session";
import { useThemeMode } from "../theme/theme-mode";
import { NotificationBell } from "./notification-bell";
import { TopBar } from "./top-bar";
import { UserMenu } from "./user-menu";

export function AppTopBar() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const { data: unread = 0 } = useUnreadCount();
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const logout = useLogout();
  const { resolved, setMode } = useThemeMode();
  if (!user) return null;

  const items = flattenNotifications(data?.pages);
  const name = user.name?.trim() || null;
  return (
    <TopBar
      right={
        <>
          <NotificationBell
            items={items.map((n) => ({ ...n, linked: routeForTarget(n.target) !== null }))}
            unread={unread}
            markingAll={markRead.isPending}
            onMarkAllRead={() => markRead.mutate({ all: true })}
            onViewAll={() => router.push("/notifications")}
            onSelect={(item) => {
              const full = items.find((n) => n.id === item.id);
              if (!full) return;
              if (full.readAt === null) markRead.mutate({ ids: [full.id] });
              const route = routeForTarget(full.target);
              if (route) router.push(route);
            }}
          />
          <UserMenu
            role={user.role}
            userName={name}
            initials={initialsOf(name, user.role.charAt(0))}
            isDark={resolved === "dark"}
            onToggleTheme={() => void setMode(resolved === "dark" ? "light" : "dark")}
            onProfile={() => router.push(user.role === "STUDENT" ? "/profile" : "/settings")}
            onSignOut={() => void logout()}
          />
        </>
      }
    />
  );
}
