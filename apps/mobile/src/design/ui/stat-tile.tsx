import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressDim } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

/**
 * A figure and its label. The value is a count/score, so it is never
 * ellipsized: it shrinks to fit one line. The label takes two lines and
 * shrinks before it would need a third; its font scale is capped. The tile's
 * minimum width keeps the longest label word ("assignments" at 1.3x) whole:
 * Android breaks a word mid-word when it does not fit a line, and shrinking
 * cannot stop that because the broken word still fits two lines. A row of
 * tiles should `flex-wrap` so they drop to two columns instead of squeezing.
 * With `onPress` the tile is a button that dims while pressed; without it, a
 * plain view. The figure shows at once, never counting up (owner, 2026-11-07).
 */
function StatTile({
  value, suffix, label, className, onPress,
}: { value: number | string; suffix?: string; label: string; className?: string; onPress?: () => void }) {
  const press = usePressDim();
  const a11yLabel = `${label}: ${value}${suffix ?? ""}`;
  const body = (
    <>
      <Text variant="largeTitle" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} maxFontSizeMultiplier={1.3}>
        {`${value}${suffix ?? ""}`}
      </Text>
      <Text
        variant="caption"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.3}
        className="text-muted-foreground"
      >
        {label}
      </Text>
    </>
  );
  const look = cn("gap-0.5 rounded-group bg-surface p-4", className);
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11yLabel} className={cn("min-w-[136px] flex-1", look)}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-w-[136px] flex-1"
    >
      <Animated.View style={press.animatedStyle}>
        <View className={look}>{body}</View>
      </Animated.View>
    </Pressable>
  );
}

export { StatTile };
