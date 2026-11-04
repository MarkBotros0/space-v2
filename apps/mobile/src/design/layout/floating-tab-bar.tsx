import type { BottomTabBarProps } from "expo-router/js-tabs";
import type { NavItem } from "@space/shared";
import { BlurView } from "expo-blur";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { routeNameForHref } from "../../lib/route-names";
import { shadowStyle } from "../lib/shadow";
import { DURATION, useReducedMotion } from "../motion";
import { NavLink } from "./nav-link";
import { PillHighlight } from "./pill-highlight";
import { resetTabBarScroll, useTabBarVisible } from "./tab-bar-scroll";

/**
 * The frosted floating pill: `bg-pill` fill over a blur. iOS blurs the
 * backdrop (BlurView intensity 40 under the fill). Android renders the fill
 * alone: since Expo SDK 55 a real blur needs a `blurTarget` the tab navigator
 * cannot give a bar it renders beside its scenes, and the fill is opaque
 * enough (alpha .78 / .86) to hold contrast without it.
 */
const PILL_HEIGHT = 64;

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

/**
 * Expo Router 58's tab bar gets `navigateToTab(routeKey)` instead of a
 * navigation object, so a tab's route name is looked up in the navigator
 * state for its key.
 */
export function PillTabBar({ items, state, navigateToTab }: BottomTabBarProps & { items: NavItem[] }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const visible = useTabBarVisible();
  const shown = items.slice(0, 5);
  const routeActive = activeTabRoute(state.routes[state.index]?.name, shown.map((i) => routeNameForHref(i.href)));
  // The route the user just pressed, highlighted at once: the highlight must not wait
  // for the navigator, and a second press before the first settles retargets it.
  const [pressed, setPressed] = useState<string | null>(null);
  const active = pressed ?? routeActive;
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  useEffect(() => setPressed(null), [routeActive]);
  // A tab change always brings the pill back, however the last screen left it.
  const focusedKey = state.routes[state.index]?.key;
  useEffect(() => resetTabBarScroll(), [focusedKey]);

  const offset = Math.max(16, insets.bottom);
  const hideBy = PILL_HEIGHT + offset + 8;
  const shownValue = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    shownValue.value = withTiming(visible ? 1 : 0, { duration: DURATION.base });
  }, [visible, shownValue]);
  const slide = useAnimatedStyle(() =>
    reduced
      ? { opacity: shownValue.value }
      : { transform: [{ translateY: (1 - shownValue.value) * hideBy }] },
  );

  return (
    <Animated.View
      testID="pill-root"
      // Hidden: never block the touches of the screen the pill used to cover. It stays in
      // the accessibility tree (a screen reader does not scroll-hide).
      pointerEvents={visible ? "box-none" : "none"}
      className="absolute inset-x-4 items-center"
      style={[{ bottom: offset }, slide]}
    >
      <View
        className="h-16 w-full max-w-md flex-row items-center overflow-hidden rounded-full border border-white/10 px-2"
        style={shadowStyle("lift")}
      >
        {Platform.OS === "ios" ? <BlurView intensity={40} style={StyleSheet.absoluteFill} /> : null}
        <View className="absolute inset-0 bg-pill" />
        <PillHighlight target={active ? (layouts[active] ?? null) : null} />
        {shown.map((item) => {
          const name = routeNameForHref(item.href);
          return (
            <NavLink
              key={item.href}
              label={item.label}
              icon={item.icon}
              featured={item.icon === "home"}
              active={active === name}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setLayouts((prev) =>
                  prev[name]?.x === x && prev[name]?.width === width ? prev : { ...prev, [name]: { x, width } },
                );
              }}
              onPress={() => {
                setPressed(name);
                const key = state.routes.find((r) => r.name === name)?.key;
                if (key) navigateToTab(key);
              }}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}
