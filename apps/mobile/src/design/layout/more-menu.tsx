/**
 * The /more page (v1 src/components/layout/more-menu.tsx) on grouped rows: an
 * identity row (initials, name, role badge), the sidebar destinations that
 * are not tabs, Appearance with the theme toggle, and Sign out and Delete
 * account as destructive rows. Rows navigate through onNavigate. Row icons come from the
 * tab bar's map (NavIcon), so a destination looks the same in the bar and here.
 */
import type { RoleNav, UserRole } from "@space/shared";
import { LogOut, Trash2 } from "lucide-react-native";
import { View } from "react-native";

import { moreItemsFor } from "../../lib/nav-routes";
import { NavIcon } from "../icons/nav-icon";
import { iconWithClassName } from "../lib/icon";
import { GroupedList, ListRow } from "../ui/grouped-list";
import { Badge } from "../ui/badge";
import { Text } from "../ui/text";
import { ThemeToggle } from "../ui/theme-toggle";
import { Screen } from "./screen";
import { roleBadge } from "./user-menu";

iconWithClassName(LogOut, Trash2);

/** v1: first letters of the first two name parts, else the role's initial. */
function initialsFor(name: string | null, role: UserRole): string {
  const parts = name?.split(/\s+/) ?? [];
  return name
    ? ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()
    : role.charAt(0).toUpperCase();
}

export function MoreMenu({
  role,
  graduationYear = null,
  userName,
  nav,
  onNavigate,
  onSignOut,
  onDeleteAccount,
}: {
  role: UserRole;
  /** Set for a graduated student, whose badge reads ALUMNI. */
  graduationYear?: number | null;
  userName: string | null;
  nav: RoleNav;
  onNavigate: (href: string) => void;
  onSignOut: () => void;
  /** Omitted: no Delete account row. */
  onDeleteAccount?: () => void;
}) {
  // The same list more-back.test.tsx walks: sidebar entries that are not a tab.
  const items = moreItemsFor(nav);
  const name = userName?.trim() || null;
  const badge = roleBadge(role, graduationYear);
  return (
    <Screen title="More" subtitle="Account, settings, and more places to go.">
      <View className="flex-col gap-6">
        <GroupedList>
          <ListRow
            title={name ?? badge.label}
            titleLines={2}
            leading={
              <View className="size-10 items-center justify-center rounded-full bg-muted">
                <Text variant="headline">{initialsFor(name, role)}</Text>
              </View>
            }
            trailing={name ? <Badge role={badge.color}>{badge.label}</Badge> : undefined}
          />
        </GroupedList>
        {items.length > 0 ? (
          <GroupedList>
            {items.map((item, i) => (
              <ListRow
                key={item.href}
                index={i}
                title={item.label}
                leading={<NavIcon name={item.icon} size={20} className="text-foreground" />}
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
