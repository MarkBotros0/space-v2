import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { cn } from "../../../design/lib/cn";
import { iconWithClassName } from "../../../design/lib/icon";
import { haptic } from "../../../design/motion";
import { Checkbox, ContentText } from "../../../design/ui";

iconWithClassName(Check);

/** One option of a question: a radio (single choice, true/false) or a checkbox ("Choose N"), 44pt or taller. */
export function ChoiceRow({
  role,
  label,
  accessibilityLabel,
  checked,
  disabled = false,
  onPress,
}: {
  role: "radio" | "checkbox";
  label: string;
  accessibilityLabel: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
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
        "min-h-11 flex-row items-center gap-3 rounded-control border px-4 py-3",
        checked ? "border-ring bg-accent" : "border-control-border bg-surface",
        disabled && "opacity-50",
      )}
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
      <ContentText
        variant="subhead"
        className={cn("min-w-0 flex-1 font-medium", checked ? "text-accent-foreground" : "text-foreground")}
      >
        {label}
      </ContentText>
    </Pressable>
  );
}
