import { useEffect, useRef } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { SPRING, useReducedMotion } from "../motion";

export type HighlightTarget = { x: number; width: number } | null;

/**
 * The active tab's highlight: one absolutely positioned view whose translateX
 * and width spring to the measured layout of the active tab. A new target
 * replaces the running spring (interruptible: B then C ends at C). The first
 * measurement, and every one under reduced motion, is a jump.
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
    if (tx === undefined || tw === undefined) return;
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
    <Animated.View
      testID="pill-highlight"
      pointerEvents="none"
      className="absolute inset-y-1 left-0 rounded-full bg-pill-active/20"
      style={style}
    />
  );
}
