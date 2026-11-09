/**
 * A small soft pill for a light action beside content: "See all" on a section
 * header, "Clear due date" under a field (owner, 2026-11-07: no underlined
 * links anywhere). The look is 32pt tall, rounded-full, info-soft fill with
 * info text (4.5:1 in both themes, design-tokens-contrast.test.ts); hitSlop
 * makes the touch target 44pt. Dims while pressed; classes stay off the
 * Animated.View. Sits where it is put: add `self-start` in a column.
 */
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressDim } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

/** Extra touch area above and below the 32pt pill, to 44pt. */
const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

type PillButtonProps = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Greys it and ignores presses (an action already in flight). */
  disabled?: boolean;
  /** A removing action: bad-soft fill and bad text instead of info. */
  destructive?: boolean;
  className?: string;
};

function PillButton({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  destructive = false,
  className,
}: PillButtonProps) {
  const press = usePressDim();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={disabled ? { disabled: true } : undefined}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className={cn("shrink-0", disabled && "opacity-50", className)}
    >
      <Animated.View style={press.animatedStyle}>
        <View
          testID="pill-button"
          className={cn(
            "min-h-[32px] items-center justify-center rounded-full px-3",
            destructive ? "bg-bad-soft" : "bg-info-soft",
          )}
        >
          <Text
            variant="subhead"
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            className={cn("font-semibold", destructive ? "text-bad" : "text-info")}
          >
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export { PillButton };
export type { PillButtonProps };
