import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { cssInterop } from "nativewind";

import { SPRING } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

cssInterop(Animated.View, { className: "style" });

type Option = { value: string; label: string };
const PAD = 2;

/** Two-to-four way switch; the thumb slides to the selected segment with SPRING.snappy. */
function SegmentedControl({
  options, value, onChange, className,
}: { options: Option[]; value: string; onChange: (value: string) => void; className?: string }) {
  const [width, setWidth] = useState(0);
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(index * segment);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  useEffect(() => {
    x.value = withSpring(index * segment, SPRING.snappy);
  }, [x, index, segment]);
  return (
    <View
      className={cn("flex-row rounded-xl bg-neutral-soft p-0.5", className)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-0.5 left-0.5 top-0.5 rounded-[10px] bg-surface"
          style={[{ width: segment }, style]}
        />
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
            className="min-h-[40px] flex-1 items-center justify-center px-2"
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

export { SegmentedControl };
