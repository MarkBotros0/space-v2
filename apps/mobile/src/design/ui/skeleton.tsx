/**
 * Port of v1 src/components/ui/skeleton.tsx.
 * Native differences: v1's .jpc-shimmer sweeps a lighter band across
 * bg-muted every 1.6s; here bg-muted pulses opacity 1 → 0.6 → 1 over the
 * same 1.6s (closest native equivalent without a gradient mask).
 */
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { cssInterop } from "nativewind";

import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";

// The pulse and the size classes must sit on the same view, or w-2/3 resolves
// against an unsized wrapper.
cssInterop(Animated.View, { className: "style" });

function Skeleton({ className }: { className?: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity }} accessibilityElementsHidden className={cn("rounded-md bg-muted", className)} />
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
    <View className={cn("flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4", className)} style={shadowStyle("soft")}>
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={3} />
    </View>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
