/**
 * The /more page (v1 src/components/layout/more-menu.tsx) on grouped rows: an
 * identity row (initials and name, no badge) that opens Profile (owner,
 * 2026-11-07), the sidebar destinations that
 * are not tabs, Appearance with the theme toggle, and Sign out and Delete
 * account as destructive rows. Rows navigate through onNavigate. Row icons come from the
 * tab bar's map (NavIcon), so a destination looks the same in the bar and here.
 */
import type { RoleNav, UserRole } from "@space/shared";
import { LogOut, Trash2 } from "lucide-react-native";
import { View } from "react-native";

import { useAnnouncementUnread } from "../../hooks/use-announcements";
import { moreItemsFor } from "../../lib/nav-routes";
import { NavIcon } from "../icons/nav-icon";
import { iconWithClassName } from "../lib/icon";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { StatusChip } from "../ui/status-chip";
import { Text } from "../ui/text";
import { ThemeToggle } from "../ui/theme-toggle";
import { Screen } from "./screen";

iconWithClassName(LogOut, Trash2);

/** v1: first letters of the first two name parts, else the role's initial. */
function initialsFor(name: string | null, role: UserRole): string {
  const parts = name?.split(/\s+/) ?? [];
  return name ? ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() : role.charAt(0).toUpperCase();
}

export function MoreMenu({
  role,
  userName,
  nav,
  onNavigate,
  onOpenProfile,
  onSignOut,
  onDeleteAccount,
}: {
  role: UserRole;
  userName: string | null;
  nav: RoleNav;
  onNavigate: (href: string) => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  /** Omitted: no Delete account row. */
  onDeleteAccount?: () => void;
}) {
  // The same list more-back.test.tsx walks: sidebar entries that are not a tab.
  const items = moreItemsFor(nav);
  const unread = useAnnouncementUnread().data?.count ?? 0;
  const name = userName?.trim() || null;
  return (
    <Screen title="More" subtitle="Account, settings, and more places to go.">
      <View className="flex-col gap-6">
        <GroupedList>
          <ListRow
            title={name ?? "Your profile"}
            subtitle="View and edit your profile"
            titleLines={2}
            leading={
              <View className="size-10 items-center justify-center rounded-full bg-muted">
                <Text variant="headline">{initialsFor(name, role)}</Text>
              </View>
            }
            chevron
            onPress={onOpenProfile}
          />
        </GroupedList>
        {items.length > 0 ? (
          <GroupedList>
            {items.map((item) => (
              <ListRow
                key={item.href}
                title={item.label}
                leading={<NavIcon name={item.icon} size={20} className="text-foreground" />}
                // The count is words ("2 new"), never a bare colour dot; the row's label says "N unread".
                trailing={
                  item.href === "/announcements" && unread > 0 ? (
                    <StatusChip tone="info" label={`${unread > 99 ? "99+" : unread} new`} />
                  ) : undefined
                }
                trailingLabel={item.href === "/announcements" && unread > 0 ? `${unread} unread` : undefined}
                chevron
                onPress={() => onNavigate(item.href)}
              />
            ))}
          </GroupedList>
        ) : null}
        <GroupedList>
          <ListRow
            title="Appearance"
            subtitle="Switch between light and dark."
            subtitleLines={2}
            trailing={<ThemeToggle size="icon" />}
          />
        </GroupedList>
        <GroupedList>
          <ListRow
            title="Sign out"
            destructive
            leading={<LogOut size={20} className="text-bad" />}
            onPress={onSignOut}
          />
          {onDeleteAccount ? (
            <ListRow
              title="Delete account"
              subtitle="Removes your account and signs you out everywhere."
              subtitleLines={2}
              destructive
              leading={<Trash2 size={20} className="text-bad" />}
              onPress={onDeleteAccount}
            />
          ) : null}
        </GroupedList>
      </View>
    </Screen>
  );
}
