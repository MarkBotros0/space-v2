/**
 * Port of v1 src/components/layout/more-menu.tsx — the /more page: header,
 * identity card (initials, name, role badge), the sidebar destinations that
 * are not tabs, Appearance with the theme toggle, and Sign out.
 * Native differences: rows navigate through onNavigate; hover → active:;
 * md: padding dropped. Row icons come from the tab bar's map (NavIcon), so a
 * destination looks the same in the bar and here (v1 kept a second map).
 */
import type { RoleNav, UserRole } from "@space/shared";
import { ChevronRight, LogOut } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { moreItemsFor } from "../../lib/nav-routes";
import { NavIcon } from "../icons/nav-icon";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Badge } from "../ui/badge";
import { Text } from "../ui/text";
import { ThemeToggle } from "../ui/theme-toggle";
import { PageHeader } from "./page-header";
import { ROLE_COLOR } from "./user-menu";

iconWithClassName(ChevronRight, LogOut);

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
  onSignOut,
}: {
  role: UserRole;
  userName: string | null;
  nav: RoleNav;
  onNavigate: (href: string) => void;
  onSignOut: () => void;
}) {
  // The same list more-back.test.tsx walks: sidebar entries that are not a tab.
  const items = moreItemsFor(nav);
  const name = userName?.trim() || null;
  return (
    <View className="flex-col gap-6">
      <PageHeader title="More" description="Account, settings, and more places to go." />
      <View className="flex-row items-center gap-3 rounded-group bg-surface dark:border dark:border-separator p-4">
        <View className="size-12 items-center justify-center rounded-full bg-muted">
          <Text className="text-base font-semibold text-foreground">{initialsFor(name, role)}</Text>
        </View>
        <View className="flex-1 flex-col gap-1">
          {name ? <Text className="text-sm font-semibold text-foreground">{name}</Text> : null}
          <Badge role={ROLE_COLOR[role]} className="self-start">{role}</Badge>
        </View>
      </View>
      {items.length > 0 ? (
        <View className="overflow-hidden rounded-group bg-surface dark:border dark:border-separator">
          {items.map((item, i) => {
            return (
              <Pressable
                key={item.href}
                accessibilityRole="link"
                onPress={() => onNavigate(item.href)}
                className={cn("flex-row items-center gap-3 px-4 py-3 active:bg-accent", i > 0 && "border-t border-border")}
              >
                <View className="size-9 items-center justify-center rounded-lg bg-muted">
                  <NavIcon name={item.icon} size={16} className="text-foreground" />
                </View>
                <Text numberOfLines={1} className="flex-1 text-sm font-medium text-foreground">
                  {item.label}
                </Text>
                <ChevronRight size={16} className="text-muted-foreground" />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View className="flex-row items-center justify-between rounded-group bg-surface dark:border dark:border-separator p-4">
        <View className="flex-col gap-0.5">
          <Text className="text-sm font-medium text-foreground">Appearance</Text>
          <Text className="text-xs text-muted-foreground">Switch between light and dark.</Text>
        </View>
        <ThemeToggle size="icon" />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onSignOut}
        className="w-full flex-row items-center justify-center gap-2 rounded-group bg-surface dark:border dark:border-separator p-4 active:bg-error-50 dark:active:bg-error-950"
      >
        <LogOut size={16} className="text-error-700 dark:text-error-200" />
        <Text className="text-sm font-medium text-error-700 dark:text-error-200">Sign out</Text>
      </Pressable>
    </View>
  );
}
