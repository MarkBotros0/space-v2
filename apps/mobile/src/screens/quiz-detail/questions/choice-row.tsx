import { Check } from "lucide-react-native";
import { View } from "react-native";
import { Pressable } from "../../../design/ui/pressable";

import { cn } from "../../../design/lib/cn";
import { iconWithClassName } from "../../../design/lib/icon";
import { haptic } from "../../../design/motion";
import { Checkbox } from "../../../design/ui";
import { OptionLabel } from "../true-false-glyph";

iconWithClassName(Check);

/**
 * One option of a question: a radio (single choice, true/false) or a checkbox ("Choose N"), 44pt or taller.
 * The row runs in the question's direction (the control on the right in an Arabic question), and the label
 * keeps its own writing direction but sits against the control.
 */
export function ChoiceRow({
  role,
  label,
  accessibilityLabel,
  checked,
  direction = "ltr",
  disabled = false,
  trueFalse = false,
  onPress,
}: {
  role: "radio" | "checkbox";
  label: string;
  accessibilityLabel: string;
  checked: boolean;
  /** The question prompt's direction; ltr for app chrome (the editor's True / False). */
  direction?: "rtl" | "ltr";
  disabled?: boolean;
  /** A true/false option: drawn as a tick or a cross, not the word. */
  trueFalse?: boolean;
  onPress: () => void;
}) {
  const rtl = direction === "rtl";
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={role === "radio" ? { selected: checked, checked, disabled } : { checked, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic("selection");
        onPress();
      }}
      className={cn(
        "min-h-11 items-center gap-3 rounded-control border px-4 py-3",
        checked ? "border-ring bg-accent" : "border-control-border bg-surface",
        disabled && "opacity-50",
      )}
      style={{ flexDirection: rtl ? "row-reverse" : "row" }}
    >
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {role === "checkbox" ? (
          <Checkbox checked={checked} onCheckedChange={() => {}} accessibilityLabel={accessibilityLabel} />
        ) : (
          <View
            className={cn(
              "size-5 shrink-0 items-center justify-center rounded-full border",
              checked ? "border-ring bg-ring" : "border-control-border",
            )}
          >
            {checked ? <Check size={12} className="text-primary-foreground" /> : null}
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1" style={{ alignItems: rtl ? "flex-end" : "flex-start" }}>
        <OptionLabel
          label={label}
          trueFalse={trueFalse}
          className={cn("font-medium", checked ? "text-accent-foreground" : "text-foreground")}
          style={{ textAlign: rtl ? "right" : "left" }}
        />
      </View>
    </Pressable>
  );
}
