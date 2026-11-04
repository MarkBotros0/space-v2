/**
 * Redesign placeholder block: a surface-toned rounded rectangle whose opacity
 * breathes 0.55 <-> 1 (withRepeat/withTiming). Under reduced motion it is a
 * static 0.7 and nothing runs. `className` still works for the existing call
 * sites; `width`/`height`/`radius` are the explicit sizing props.
 * The caller's classes and sizes sit on a plain View (so w-2/3 and flex-1
 * resolve against the real parent), which clips a pulsing Animated.View fill.
 * The Animated.View takes only styles: classes on it are dropped on device.
 */
import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { cn } from "../lib/cn";
import { useReducedMotion } from "../motion";

const STATIC_OPACITY = 0.7;

function Skeleton({
  className,
  width,
  height,
  radius,
}: {
  className?: string;
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(withTiming(0.55, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduced, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View
      testID="skeleton"
      accessibilityElementsHidden
      className={cn("overflow-hidden rounded-lg", className)}
      style={[
        width !== undefined ? { width } : null,
        height !== undefined ? { height } : null,
        radius !== undefined ? { borderRadius: radius } : null,
      ]}
    >
      <Animated.View
        testID="skeleton-pulse"
        style={[StyleSheet.absoluteFill, reduced ? { opacity: STATIC_OPACITY } : animated]}
      >
        <View className="flex-1 bg-separator" />
      </Animated.View>
    </View>
  );
}

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <View className={cn("flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </View>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <View className={cn("flex-col gap-3 rounded-2xl border border-separator bg-surface p-4", className)}>
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={3} />
    </View>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
