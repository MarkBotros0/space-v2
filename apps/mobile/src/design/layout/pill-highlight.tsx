import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { DURATION, SPRING, useReducedMotion } from "../motion";

export type HighlightTarget = { x: number; width: number } | null;

/**
 * The active tab's highlight: one absolutely positioned view whose translateX
 * and width spring to the measured layout of the active tab. A new target
 * replaces the running spring (interruptible: B then C ends at C). The first
 * measurement, and every one under reduced motion, is a jump. With no target
 * (the focused tab is not in this role's bar: More → My notes) it fades out
 * where it is, so a lit capsule never sits under a tab drawn inactive.
 * The Animated.View takes only plain and animated styles; the themed fill is a
 * plain View inside it (classes on an Animated.View are dropped on device).
 */
export function PillHighlight({ target }: { target: HighlightTarget }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const opacity = useSharedValue(0);
  const placed = useRef(false);

  const tx = target?.x;
  const tw = target?.width;
  useEffect(() => {
    if (tx === undefined || tw === undefined) {
      opacity.value = reduced ? 0 : withTiming(0, { duration: DURATION.fast });
      return;
    }
    if (reduced || !placed.current) {
      x.value = tx;
      width.value = tw;
    } else {
      x.value = withSpring(tx, SPRING.snappy);
      width.value = withSpring(tw, SPRING.snappy);
    }
    placed.current = true;
    opacity.value = 1;
  }, [tx, tw, reduced, x, width, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: width.value,
    transform: [{ translateX: x.value }],
  }));

  return (
    <Animated.View testID="pill-highlight" pointerEvents="none" style={[styles.track, style]}>
      <View className="flex-1 rounded-full bg-pill-active/20" />
    </Animated.View>
  );
}

// `absolute inset-y-1 left-0` (inset-y-1 = 4px).
const styles = StyleSheet.create({ track: { position: "absolute", top: 4, bottom: 4, left: 0 } });
