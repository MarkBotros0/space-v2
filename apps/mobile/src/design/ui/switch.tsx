/**
 * Port of v1 src/components/ui/switch.tsx (Base UI Switch): h-6 w-11 track,
 * bg-muted → bg-brand-teal-500 when checked, size-5 white thumb at
 * translate-x 0.5 / 22px.
 * Native differences: custom Pressable (RN Switch cannot take v1's look);
 * thumb position not animated; focus ring dropped.
 */
import { Pressable, View } from "react-native";

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
        "relative h-6 w-11 shrink-0 justify-center rounded-full",
        checked ? "bg-brand-teal-500" : "bg-muted",
        disabled && "opacity-50",
        className,
      )}
    >
      <View
        className="size-5 rounded-full bg-white"
        style={[{ transform: [{ translateX: checked ? 22 : 2 }] }, shadowStyle("sm")]}
      />
    </Pressable>
  );
}

export { Switch };
