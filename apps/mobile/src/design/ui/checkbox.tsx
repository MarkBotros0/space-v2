/**
 * v1 uses a native `<input type="checkbox" class="size-4">` (student notes'
 * "Flag for admin follow-up"); this draws the same 16px box.
 */
import { Check } from "lucide-react-native";
import { Pressable } from "react-native";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";

iconWithClassName(Check);

export function Checkbox({
  checked,
  onCheckedChange,
  accessibilityLabel,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      hitSlop={8}
      className={cn(
        "size-4 items-center justify-center rounded-[3px] border",
        checked ? "border-primary bg-primary" : "border-input bg-background",
        disabled && "opacity-50",
      )}
    >
      {checked ? <Check size={12} strokeWidth={3} className="text-primary-foreground" /> : null}
    </Pressable>
  );
}
