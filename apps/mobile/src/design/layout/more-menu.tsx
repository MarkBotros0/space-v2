/**
 * Port of v1 src/components/layout/more-menu.tsx — the /more page: header,
 * identity card (initials, name, role badge), the sidebar destinations that
 * are not tabs, Appearance with the theme toggle, and Sign out.
 * Native differences: rows navigate through onNavigate; hover → active:;
 * md: padding dropped. v1's icon map here differs from nav-link's
 * (history → FileText) and is kept as v1 has it.
 */
import type { NavIconName, NavItem, UserRole } from "@space/shared";
import {
  Bell,
  Calendar,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  FileText,
  Folders,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Notebook,
  PenLine,
  Settings,
  Sparkles,
  User,
  UserCheck,
  UserMinus,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { Badge } from "../ui/badge";
import { Text } from "../ui/text";
import { ThemeToggle } from "../ui/theme-toggle";
import { PageHeader } from "./page-header";
import { ROLE_COLOR } from "./user-menu";

/** v1 more-menu.tsx iconMap; attendance/notifications are v2-only names. */
const ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  dashboard: LayoutDashboard,
  users: Users,
  calendar: Calendar,
  events: CalendarDays,
  assignments: ClipboardList,
  attendance: CheckCheck,
  submissions: FileText,
  history: FileText,
  profile: User,
  reports: FileText,
  groups: Folders,
  season: Sparkles,
  students: GraduationCap,
  alumni: UserCheck,
  dropped: UserMinus,
  notes: Notebook,
  notifications: Bell,
  quizzes: PenLine,
  more: MoreHorizontal,
  settings: Settings,
};
iconWithClassName(...Object.values(ICONS), ChevronRight, LogOut);

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
  nav: { tabs: NavItem[]; sidebar: NavItem[] };
  onNavigate: (href: string) => void;
  onSignOut: () => void;
}) {
  const tabHrefs = new Set(nav.tabs.map((t) => t.href));
  const items = nav.sidebar.filter((item) => !tabHrefs.has(item.href));
  const name = userName?.trim() || null;
  return (
    <View className="flex-col gap-6">
      <PageHeader title="More" description="Account, settings, and more places to go." />
      <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
        <View className="size-12 items-center justify-center rounded-full bg-muted">
          <Text className="text-base font-semibold text-foreground">{initialsFor(name, role)}</Text>
        </View>
        <View className="flex-1 flex-col gap-1">
          {name ? <Text className="text-sm font-semibold text-foreground">{name}</Text> : null}
          <Badge role={ROLE_COLOR[role]}>{role}</Badge>
        </View>
      </View>
      {items.length > 0 ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-card" style={shadowStyle("soft")}>
          {items.map((item, i) => {
            const Icon = ICONS[item.icon];
            return (
              <Pressable
                key={item.href}
                accessibilityRole="link"
                onPress={() => onNavigate(item.href)}
                className={cn("flex-row items-center gap-3 px-4 py-3 active:bg-accent", i > 0 && "border-t border-border")}
              >
                <View className="size-9 items-center justify-center rounded-lg bg-muted">
                  <Icon size={16} className="text-foreground" />
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
      <View className="flex-row items-center justify-between rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
        <View className="flex-col gap-0.5">
          <Text className="text-sm font-medium text-foreground">Appearance</Text>
          <Text className="text-xs text-muted-foreground">Switch between light and dark.</Text>
        </View>
        <ThemeToggle size="icon" />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onSignOut}
        className="w-full flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-card p-4 active:bg-error-50 dark:active:bg-error-950"
        style={shadowStyle("soft")}
      >
        <LogOut size={16} className="text-error-700 dark:text-error-200" />
        <Text className="text-sm font-medium text-error-700 dark:text-error-200">Sign out</Text>
      </Pressable>
    </View>
  );
}
