/**
 * Port of v1 src/components/layout/user-menu.tsx — avatar trigger and the
 * same menu: name + role badge, Profile settings, Dark/Light mode, Sign out.
 * Native differences: Base UI Menu → AnchoredPopover (align end, 8px);
 * data-[highlighted] → active:bg-accent; navigation and theme switching are
 * callbacks (wired in the app shell). The theme item, like v1's
 * closeOnClick={false}, keeps the menu open.
 */
import type { UserRole } from "@space/shared";
import { LogOut, Moon, Sun, UserRound } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Text } from "../ui/text";

iconWithClassName(LogOut, Moon, Sun, UserRound);

type RoleColor = "super" | "admin" | "leader" | "mentor" | "student";
export const ROLE_COLOR: Record<UserRole, RoleColor> = {
  SUPER: "super",
  ADMIN: "admin",
  LEADER: "leader",
  MENTOR: "mentor",
  STUDENT: "student",
};

const itemClass = "w-full flex-row items-center gap-2 rounded-sm px-2 py-1.5 active:bg-accent";

export function UserMenu({
  role,
  userName,
  initials,
  avatarUrl,
  isDark,
  onToggleTheme,
  onProfile,
  onSignOut,
}: {
  role: UserRole;
  userName: string | null;
  initials: string;
  avatarUrl?: string | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onProfile: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  const close = () => setOpen(false);
  return (
    <>
      <Pressable
        ref={anchor.ref}
        accessibilityRole="button"
        accessibilityLabel="User menu"
        onPress={() => {
          anchor.measure();
          setOpen(true);
        }}
        className="relative flex-row items-center gap-2 rounded-full p-0.5"
      >
        <Avatar size="md">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="Your photo" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </Pressable>
      <AnchoredPopover open={open} onClose={close} anchor={anchor.rect} align="end" sideOffset={8}>
        <View className="min-w-56 rounded-md border border-border bg-popover p-1">
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              close();
              onProfile();
            }}
            className={cn(itemClass, "flex-col items-start gap-1 py-2")}
          >
            {userName ? (
              <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                {userName}
              </Text>
            ) : null}
            <Badge role={ROLE_COLOR[role]} className="self-start">{role}</Badge>
          </Pressable>
          <View className="my-1 h-px bg-border" />
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              close();
              onProfile();
            }}
            className={itemClass}
          >
            <UserRound size={16} className="text-popover-foreground" />
            <Text className="text-sm text-popover-foreground">Profile settings</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onToggleTheme} className={itemClass}>
            {isDark ? <Sun size={16} className="text-popover-foreground" /> : <Moon size={16} className="text-popover-foreground" />}
            <Text className="text-sm text-popover-foreground">{isDark ? "Light mode" : "Dark mode"}</Text>
          </Pressable>
          <View className="my-1 h-px bg-border" />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              close();
              onSignOut();
            }}
            className={itemClass}
          >
            <LogOut size={16} className="text-popover-foreground" />
            <Text className="text-sm text-popover-foreground">Sign out</Text>
          </Pressable>
        </View>
      </AnchoredPopover>
    </>
  );
}
