import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import type { NavItem } from "@space/shared";

import { NavIcon } from "../../src/components/NavIcon";
import { useLogout } from "../../src/hooks/use-session";
import { moreItemsFor, navHref } from "../../src/lib/nav-routes";
import { initialsOf } from "../../src/lib/initials";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, Screen, Text } from "../../src/ui";

function MoreRow({ item }: { item: NavItem }) {
  const theme = useTheme();
  const router = useRouter();
  const target = navHref(item.href);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (target) router.push(target);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
      }}
    >
      <NavIcon name={item.icon} color={theme.colors.neutral[700]} size={20} />
      <Text variant="body" style={{ flex: 1 }}>
        {item.label}
      </Text>
    </Pressable>
  );
}

export default function MoreScreen() {
  const theme = useTheme();
  const user = useSessionStore((s) => s.user);
  const nav = useSessionStore((s) => s.nav());
  const logout = useLogout();

  const items = nav ? moreItemsFor(nav) : [];

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <Text variant="title">More</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        Account, settings, and more places to go.
      </Text>

      {user ? (
        <Card style={{ marginTop: theme.spacing.md, flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: theme.radii.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.neutral[100],
            }}
          >
            <Text variant="heading">{initialsOf(user.name, user.role.charAt(0).toUpperCase())}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {user.name ? <Text variant="heading">{user.name}</Text> : null}
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {user.role}
            </Text>
          </View>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <Card style={{ marginTop: theme.spacing.md }}>
          {items.map((item) => (
            <MoreRow key={item.href} item={item} />
          ))}
        </Card>
      ) : null}

      <View style={{ marginTop: theme.spacing.lg }}>
        <Button title="Sign out" variant="secondary" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}
