import type { NavIconName } from "@space/shared";
import { Pressable, type LayoutChangeEvent } from "react-native";

import { NavIcon } from "../icons/nav-icon";
import { cn } from "../lib/cn";
import { haptic } from "../motion";
import { Text } from "../ui/text";

/**
 * One tab of the pill. Only the selected tab names itself (owner, 2026-11-07):
 * it sizes to its icon and label side by side, and the others share what is
 * left as icons alone, at least 44pt each. The name is always the tab's
 * accessibility label, so a screen reader hears every tab by name. The sliding
 * highlight lives in the pill (PillHighlight); here only the colours switch to
 * the pill tokens (no icon scale: the owner found the tab bar over-animated).
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
      className={cn(
        "relative flex-row items-center justify-center self-stretch",
        active ? "shrink gap-1.5 px-4" : "min-w-[44px] flex-1",
      )}
    >
      <NavIcon
        name={icon}
        size={20}
        className={active ? "text-pill-active" : "text-pill-foreground"}
      />
      {/* The pill is 64px tall and shares its width with four icons: the label stops
          growing at 1.15x the font scale, and on a 360dp phone a label that still does
          not fit shrinks (down to 0.8) instead of ellipsizing ("Assignme…"). */}
      {active ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.15}
          className="shrink text-[13px] font-semibold leading-none text-pill-active-label"
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
