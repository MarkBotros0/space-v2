import type { NavIconName } from "@space/shared";
import { Pressable, View } from "react-native";

import { NavIcon } from "../icons/nav-icon";
import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { Text } from "../ui/text";

/**
 * v1 nav-link.tsx, `variant === "tab"` branch. v1 slides a `motion.span`
 * highlight between tabs; here the highlight is a plain View (no layout
 * animation), the only visible difference being the slide itself.
 */
export function NavLink({
  label,
  icon,
  active,
  featured = false,
  onPress,
}: {
  label: string;
  icon: NavIconName;
  active: boolean;
  featured?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      // v1 has px-1 here, but its truncate label still spills into that
      // padding ("Assignments" is wider than the padded tab); dropping the
      // padding gives the native label the same room instead of an ellipsis.
      className="relative flex-1 flex-col items-center justify-center gap-1 self-stretch"
    >
      <View
        className={cn(
          "relative size-9 items-center justify-center rounded-full",
          featured && "bg-brand-teal-500",
        )}
        style={featured ? shadowStyle("soft") : undefined}
      >
        {!featured && active ? <View className="absolute inset-0 rounded-full bg-white/15" /> : null}
        <NavIcon
          name={icon}
          size={20}
          className={featured ? "text-brand-navy-950" : active ? "text-white" : "text-white/55"}
        />
      </View>
      {/* The pill is 64px tall: a label past 1.15x the font scale pushes "Assignments" into
          its neighbour ("Assignm…" at 1.3), so it stops growing there. v1's inactive
          text-white/55 measured 3.5-4.0:1 on the light-theme pill, under the 4.5:1 text
          floor; 80% clears it. */}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
        className={cn("text-[10px] font-medium leading-none", active ? "text-white" : "text-white/80")}
      >
        {label}
      </Text>
    </Pressable>
  );
}
