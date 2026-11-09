/** A selectable pill for short option sets (rounded-full, 44pt tall). Selected fills with primary. */
import { Pressable } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

export function ChoiceChip({ label, selected, onPress, accessibilityLabel }: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        "min-h-[44px] items-center justify-center self-start rounded-full border px-4",
        selected ? "border-primary bg-primary" : "border-control-border bg-surface",
      )}
    >
      <Text
        variant="subhead"
        maxFontSizeMultiplier={1.3}
        className={cn("font-medium", selected ? "text-primary-foreground" : "text-foreground")}
      >
        {label}
      </Text>
    </Pressable>
  );
}
