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
      className="relative flex-1 flex-col items-center justify-center gap-1 self-stretch px-1"
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
      <Text
        numberOfLines={1}
        className={cn(
          "max-w-full text-[10px] font-medium leading-none",
          active ? "text-white" : featured ? "text-white/80" : "text-white/55",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}
