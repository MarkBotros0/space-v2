import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import type { UserRole } from "@space/shared";

import { useLogout } from "../hooks/use-session";
import { initialsOf } from "../lib/initials";
import { useSessionStore } from "../store/session";
import { useTheme } from "../theme";
import { Button, Sheet, Text } from "../ui";

/**
 * Where "Profile settings" points, per role — v1's PROFILE_HREF
 * (`jpc-space/src/components/layout/user-menu.tsx:23-30`): a student goes to
 * their profile (an alumnus too — `/profile` renders their read-only record),
 * every other role to settings.
 */
export function profileHrefFor(role: UserRole): "/profile" | "/settings" {
  return role === "STUDENT" ? "/profile" : "/settings";
}

/**
 * v1's avatar/user menu (18-settings R9/R10, REG-16; Plan 11 Decision 2): on
 * every screen and for every role, a tap on the avatar opens the user's name,
 * **Profile settings** and **Sign out**. It is the mentor's route to Settings,
 * as in v1. The avatar shows initials — there is no avatar read path in v2.
 */
export function UserMenu() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="User menu"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radii.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.neutral[100],
        }}
      >
        <Text variant="label">
          {initialsOf(user.name, user.email.charAt(0).toUpperCase() || "?")}
        </Text>
      </Pressable>
      <Sheet visible={open} title={user.name} onClose={() => setOpen(false)}>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {user.role}
        </Text>
        <Button
          title="Profile settings"
          variant="secondary"
          onPress={() => {
            setOpen(false);
            router.push(profileHrefFor(user.role));
          }}
        />
        <Button
          title="Sign out"
          variant="ghost"
          onPress={() => {
            setOpen(false);
            void logout();
          }}
        />
      </Sheet>
    </>
  );
}

/**
 * The authenticated shell's top bar, v1's `top-bar.tsx` cut down to its
 * avatar menu. The bar consumes the top safe-area inset itself, so the
 * screens below get a zero top inset — otherwise every `Screen` with the
 * "top" edge would pad for the status bar a second time.
 */
export function AppTopBar({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.xs,
          paddingBottom: theme.spacing.xs,
          paddingLeft: theme.spacing.md + insets.left,
          paddingRight: theme.spacing.md + insets.right,
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          backgroundColor: theme.colors.white,
        }}
      >
        <UserMenu />
      </View>
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
