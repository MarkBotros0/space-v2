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
 * The floating pill. iOS frosts it: the translucent `bg-pill` fill (alpha
 * .78 / .86) over a BlurView (intensity 40). Android has no blur: since Expo
 * SDK 55 a real blur needs a `blurTarget` the tab navigator cannot give a bar
 * it renders beside its scenes, and the translucent fill alone let scrolled
 * content read through the labels (R30). So Android takes the near-opaque
 * `bg-pill-solid` (alpha .92 / .94) instead.
 */
const PILL_HEIGHT = 64;

/**
 * The tab route to highlight: the focused route when it is in the bar, else
 * null (the highlight fades out). Only tab routes live in the Tabs navigator
 * (detail and pushed routes are on the (app) stack above it, Tasks 9 and
 * 12), so v1's "same first segment / a detail's list tab" fallbacks can no
 * longer fire and are gone (final review M3).
 */
export function activeTabRoute(current: string | undefined, tabRoutes: string[]): string | null {
  return current !== undefined && tabRoutes.includes(current) ? current : null;
}

/**
 * Expo Router 58's tab bar gets `navigateToTab(routeKey)` instead of a
 * navigation object, so a tab's route name is looked up in the navigator
 * state for its key.
 */
export function PillTabBar({
  items,
  state,
  navigateToTab,
}: BottomTabBarProps & { items: NavItem[] }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const visible = useTabBarVisible();
  const shown = items.slice(0, 5);
  const routeActive = activeTabRoute(
    state.routes[state.index]?.name,
    shown.map((i) => routeNameForHref(i.href)),
  );
  // The route the user just pressed, highlighted at once: the highlight must not wait
  // for the navigator, and a second press before the first settles retargets it.
  const [pending, setPending] = useState<string[]>([]);
  const active = pending[pending.length - 1] ?? routeActive;
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  // Presses wait in order for the navigator. When it reports a pressed route, that press and
  // the earlier ones are done (later ones stay pending, so B then C with B reported holds C);
  // a route nobody pressed (a link, a notification) clears them and the highlight follows it.
  useEffect(() => {
    setPending((q) => {
      const i = routeActive ? q.indexOf(routeActive) : -1;
      return i >= 0 ? q.slice(i + 1) : q.length ? [] : q;
    });
  }, [routeActive]);
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
    // The placement lives on a plain View and the Animated.View carries only the slide:
    // classes on an Animated.View are dropped on device (no-classname-on-animated.test.ts).
    <View
      testID="pill-root"
      // Hidden: never block the touches of the screen the pill used to cover. It stays in
      // the accessibility tree (a screen reader does not scroll-hide).
      pointerEvents={visible ? "box-none" : "none"}
      className="absolute inset-x-4"
      style={{ bottom: offset }}
    >
      <Animated.View testID="pill-slide" pointerEvents="box-none" style={[styles.center, slide]}>
        <View
          className="h-16 w-full max-w-md flex-row items-center overflow-hidden rounded-full border border-white/10 px-2"
          style={shadowStyle("lift")}
        >
          {Platform.OS === "ios" ? (
            <BlurView intensity={40} style={StyleSheet.absoluteFill} />
          ) : null}
          <View
            testID="pill-fill"
            className={
              Platform.OS === "ios" ? "absolute inset-0 bg-pill" : "absolute inset-0 bg-pill-solid"
            }
          />
          <PillHighlight target={active ? (layouts[active] ?? null) : null} />
          {shown.map((item) => {
            const name = routeNameForHref(item.href);
            return (
              <NavLink
                key={item.href}
                label={item.label}
                icon={item.icon}
                active={active === name}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  setLayouts((prev) =>
                    prev[name]?.x === x && prev[name]?.width === width
                      ? prev
                      : { ...prev, [name]: { x, width } },
                  );
                }}
                onPress={() => {
                  setPending((q) => [...q, name]);
                  const key = state.routes.find((r) => r.name === name)?.key;
                  if (key) navigateToTab(key);
                }}
              />
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center" } });
