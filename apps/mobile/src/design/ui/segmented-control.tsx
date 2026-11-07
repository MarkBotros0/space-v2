import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { DURATION, EASE_OUT, useReducedMotion } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

/** `accessibilityLabel` overrides the spoken name when the visible label is shortened to fit. */
type Option = { value: string; label: string; accessibilityLabel?: string };
const PAD = 2;

/**
 * Two-to-four way switch; the thumb slides to the selected segment in
 * DURATION.fast, easing out and stopping dead (no spring: owner, 2026-11-07).
 * The thumb's Animated.View takes only styles; its fill is a plain View inside
 * (classes on an Animated.View are dropped on device). The thumb is
 * `surface-raised`: white in light, and in dark lighter than the
 * `neutral-soft` track (plain `surface` is darker there and looked sunken).
 * Its radius is `control-inner` (12): concentric with the `rounded-control`
 * track (14) around a 2px inset. The track is a tablist and each segment a
 * tab, so screen readers say "tab, 1 of 2" (final review M10).
 */
function SegmentedControl({
  options, value, onChange, className,
}: { options: Option[]; value: string; onChange: (value: string) => void; className?: string }) {
  const [width, setWidth] = useState(0);
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(index * segment);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const reduced = useReducedMotion();
  const placed = useRef(false);
  useEffect(() => {
    if (segment === 0) return;
    // First measured position, and reduced motion, set the thumb without travel.
    if (reduced || !placed.current) x.value = index * segment;
    else x.value = withTiming(index * segment, { duration: DURATION.fast, easing: EASE_OUT });
    placed.current = true;
  }, [x, index, segment, reduced]);
  return (
    <View
      testID="segmented-control"
      accessibilityRole="tablist"
      className={cn("flex-row rounded-control bg-neutral-soft p-0.5", className)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segment > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.thumb, { width: segment }, style]}>
          <View testID="segmented-thumb" className="flex-1 rounded-control-inner bg-surface-raised" />
        </Animated.View>
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className="min-h-[44px] flex-1 items-center justify-center px-2"
          >
            <Text
              variant="subhead"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.3}
              className={cn("font-medium", selected ? "text-foreground" : "text-muted-foreground")}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// `absolute bottom-0.5 left-0.5 top-0.5` (0.5 = PAD).
const styles = StyleSheet.create({ thumb: { position: "absolute", top: PAD, bottom: PAD, left: PAD } });

export { SegmentedControl };
