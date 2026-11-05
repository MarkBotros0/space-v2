import type { NavIconName } from "@space/shared";
import { useEffect } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { NavIcon } from "../icons/nav-icon";
import { cn } from "../lib/cn";
import { haptic, SPRING, useReducedMotion } from "../motion";
import { Text } from "../ui/text";

/**
 * One tab of the pill. The sliding highlight lives in the pill (PillHighlight);
 * here the active icon grows to 1.08 and the colours switch to the pill tokens.
 */
export function NavLink({
  label,
  icon,
  active,
  onPress,
  onLayout,
}: {
  label: string;
  icon: NavIconName;
  active: boolean;
  onPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(active ? 1.08 : 1);
  useEffect(() => {
    const to = active ? 1.08 : 1;
    scale.value = reduced ? to : withSpring(to, SPRING.snappy);
  }, [active, reduced, scale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        haptic("selection");
        onPress();
      }}
      onLayout={onLayout}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      // No horizontal padding: "Assignments" is wider than a padded tab, and the native
      // label gets the room instead of an ellipsis.
      className="relative flex-1 flex-col items-center justify-center gap-1 self-stretch"
    >
      <Animated.View style={iconStyle}>
        <View className="size-9 items-center justify-center rounded-full">
          <NavIcon
            name={icon}
            size={20}
            className={active ? "text-pill-active" : "text-pill-foreground"}
          />
        </View>
      </Animated.View>
      {/* The pill is 64px tall: a label past 1.15x the font scale pushes "Assignments" into
          its neighbour, so it stops growing there. Across the tab's full width, a label that
          still does not fit shrinks (down to 0.8) instead of ellipsizing ("Assignme…"). */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.15}
        className={cn(
          "self-stretch text-center text-[10px] font-medium leading-none",
          active ? "text-pill-active-label" : "text-pill-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
