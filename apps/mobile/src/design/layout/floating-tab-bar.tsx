import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import type { NavItem } from "@space/shared";
import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { routeNameForHref } from "../../lib/route-names";
import { shadowStyle } from "../lib/shadow";
import { NavLink } from "./nav-link";

/**
 * v1 shell-frame.tsx mobile nav:
 *   fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto
 *   flex h-16 max-w-md items-center rounded-full bg-sidebar/75 px-2
 *   text-sidebar-foreground shadow-[var(--shadow-lift)] ring-1 ring-white/10
 *   backdrop-blur-xl backdrop-saturate-150
 * Native differences: ring → border; backdrop-blur-xl → BlurView intensity 40
 * under the translucent fill; backdrop-saturate has no native equivalent.
 */
export function FloatingTabBar({ items, state, navigation }: BottomTabBarProps & { items: NavItem[] }) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-4 items-center"
      style={{ bottom: Math.max(16, insets.bottom) }}
    >
      <View
        className="h-16 w-full max-w-md flex-row items-center overflow-hidden rounded-full border border-white/10 px-2"
        style={shadowStyle("lift")}
      >
        <BlurView intensity={40} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View className="absolute inset-0 bg-sidebar/75" />
        {items.slice(0, 5).map((item) => {
          const name = routeNameForHref(item.href);
          return (
            <NavLink
              key={item.href}
              label={item.label}
              icon={item.icon}
              featured={item.icon === "home"}
              active={current === name}
              onPress={() => navigation.navigate(name as never)}
            />
          );
        })}
      </View>
    </View>
  );
}
