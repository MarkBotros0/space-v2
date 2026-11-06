import type { NavIconName } from "@space/shared";
import { Pressable, View, type LayoutChangeEvent } from "react-native";

import { NavIcon } from "../icons/nav-icon";
import { cn } from "../lib/cn";
import { haptic } from "../motion";
import { Text } from "../ui/text";

/**
 * One tab of the pill. The sliding highlight lives in the pill (PillHighlight);
 * here only the colours switch to the pill tokens (no icon scale: the owner found
 * the tab bar over-animated).
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
      <View className="size-9 items-center justify-center rounded-full">
        <NavIcon
          name={icon}
          size={20}
          className={active ? "text-pill-active" : "text-pill-foreground"}
        />
      </View>
      {/* The pill is 64px tall: a label past 1.15x the font scale pushes "Assignments" into
          its neighbour, so it stops growing there. Across the tab's full width, a label that
          still does not fit shrinks (down to 0.8) instead of ellipsizing ("Assignme…").
          Accepted below the 12px caption floor (final review M6, 2026-11-05): 10px is v1's
          tab label, and with a 10px floor "Assignments" overflows a 360dp phone's ~62dp tab
          at 1.15x. */}
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
