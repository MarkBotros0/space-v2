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
 * Native differences: ring → border; backdrop-blur-xl → BlurView, but
 * Android's blur darkens the backdrop (bar measured #364771 vs v1 #536187),
 * so a bg-background/85 layer restores the light, blurred backdrop v1 sees
 * before its 75% navy; backdrop-saturate has no native equivalent.
 */
/**
 * v2's singular detail routes and the list tab whose v1 URL they sit under
 * (v1: /student/assignments/[id] keeps "Assignments" lit).
 */
const DETAIL_PARENT: Record<string, string> = {
  assignment: "assignments",
  group: "groups",
  quiz: "quizzes",
  submission: "submissions",
  student: "students",
  user: "users",
  event: "events",
};

/**
 * The tab route to highlight for the current route, following v1's
 * nav-link.tsx rule `pathname === href || pathname.startsWith(href + "/")`:
 * exact match, then same first segment (students/alumni → students/index),
 * then a singular detail route's list tab; null when v1 lights nothing.
 */
export function activeTabRoute(current: string | undefined, tabRoutes: string[]): string | null {
  if (!current) return null;
  if (tabRoutes.includes(current)) return current;
  const first = current.split("/")[0]!;
  const parent = DETAIL_PARENT[first] ?? first;
  return tabRoutes.find((t) => t.split("/")[0] === parent) ?? null;
}

export function FloatingTabBar({ items, state, navigation }: BottomTabBarProps & { items: NavItem[] }) {
  const insets = useSafeAreaInsets();
  const shown = items.slice(0, 5);
  const active = activeTabRoute(state.routes[state.index]?.name, shown.map((i) => routeNameForHref(i.href)));
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
        <BlurView intensity={40} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View className="absolute inset-0 bg-background/85" />
        <View className="absolute inset-0 bg-sidebar/75" />
        {shown.map((item) => {
          const name = routeNameForHref(item.href);
          return (
            <NavLink
              key={item.href}
              label={item.label}
              icon={item.icon}
              featured={item.icon === "home"}
              active={active === name}
              onPress={() => navigation.navigate(name as never)}
            />
          );
        })}
      </View>
    </View>
  );
}
