/**
 * The filter control beside a search box (owner, 2026-11-07: an icon button in
 * the search row, not a chip under it). 44pt square, the search field's own
 * fill and edge; with filters in force it turns info-soft and carries their
 * count, said in words for screen readers. Dims while pressed; classes stay
 * off the Animated.View.
 */
import { SlidersHorizontal } from "lucide-react-native";
import { View } from "react-native";
import { Pressable } from "./pressable";
import Animated from "react-native-reanimated";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { usePressDim } from "../motion";
import { Text } from "./text";

iconWithClassName(SlidersHorizontal);

export function FilterButton({ active, onPress }: { active: number; onPress: () => void }) {
  const press = usePressDim();
  const on = active > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? `Filter, ${active} active` : "Filter"}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="shrink-0"
    >
      <Animated.View style={press.animatedStyle}>
        <View
          testID="filter-button"
          className={cn(
            "size-11 items-center justify-center rounded-control border",
            on ? "border-info bg-info-soft" : "border-control-border bg-neutral-soft",
          )}
        >
          <SlidersHorizontal size={18} className={on ? "text-info" : "text-foreground"} />
          {on ? (
            <View className="absolute -right-1.5 -top-1.5 min-w-[20px] items-center rounded-full bg-primary px-1">
              <Text variant="caption" maxFontSizeMultiplier={1.15} className="font-bold text-primary-foreground">
                {String(active)}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}
