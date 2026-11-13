/**
 * Port of v1 src/components/ui/switch.tsx (Base UI Switch): h-6 w-11 track,
 * size-5 white thumb. Both states clear 3:1 against the surface in both
 * themes (UI sweep, plan 03): off is the muted fill inside a `control-border`
 * outline; on is teal 700 in light (teal 500 is 1.8:1 on white) and teal 500
 * in dark, with a matching outline. The 2px border is inside the 24x44 box, so
 * the thumb travels 0..20.
 * Native differences: custom Pressable (RN Switch cannot take v1's look);
 * thumb position not animated; focus ring dropped.
 */
import { View } from "react-native";
import { Pressable } from "./pressable";

import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";

function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  accessibilityLabel,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 justify-center rounded-full border-2",
        checked
          ? "border-brand-teal-700 bg-brand-teal-700 dark:border-brand-teal-500 dark:bg-brand-teal-500"
          : "border-control-border bg-muted",
        disabled && "opacity-50",
        className,
      )}
    >
      <View
        className="size-5 rounded-full bg-white"
        style={[{ transform: [{ translateX: checked ? 20 : 0 }] }, shadowStyle("sm")]}
      />
    </Pressable>
  );
}

export { Switch };
