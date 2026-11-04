import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { SPRING, useReducedMotion } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

type Option = { value: string; label: string };
const PAD = 2;

/**
 * Two-to-four way switch; the thumb slides to the selected segment with SPRING.snappy.
 * The thumb's Animated.View takes only styles; its fill is a plain View inside
 * (classes on an Animated.View are dropped on device). The thumb is
 * `surface-raised`: white in light, and in dark lighter than the
 * `neutral-soft` track (plain `surface` is darker there and looked sunken).
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
    else x.value = withSpring(index * segment, SPRING.snappy);
    placed.current = true;
  }, [x, index, segment, reduced]);
  return (
    <View
      testID="segmented-control"
      className={cn("flex-row rounded-xl bg-neutral-soft p-0.5", className)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segment > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.thumb, { width: segment }, style]}>
          <View testID="segmented-thumb" className="flex-1 rounded-[10px] bg-surface-raised" />
        </Animated.View>
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className="min-h-[44px] flex-1 items-center justify-center px-2"
          >
            <Text
              variant="subhead"
              numberOfLines={1}
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
