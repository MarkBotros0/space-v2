import { View } from "react-native";
import { Pressable } from "./pressable";

import { cn } from "../lib/cn";
import { FieldError } from "./field";
import { Label } from "./label";
import { Text } from "./text";

interface ChoiceOption<T> {
  value: T;
  label: string;
}

interface ChoiceChipsProps<T> {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  error?: string;
}

/**
 * A single-choice row of chips — the alumni calendar's view switch and the
 * video-question type picker. Each chip is a radio with its selected state
 * in accessibilityState, so a screen reader hears the choice and tests can
 * query it by role. Styled as v1's toggle buttons (form-parts ToggleButtons:
 * teal border and tint when selected), but wrapping, since the options can
 * outnumber a phone's width.
 */
export function ChoiceChips<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
  error,
}: ChoiceChipsProps<T>) {
  return (
    <View className="flex-col gap-1.5" accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Label>{label}</Label>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5",
                selected ? "border-ring bg-accent" : "border-control-border bg-surface active:border-ring",
              )}
            >
              <Text
                className={cn(
                  "text-sm font-medium",
                  selected ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-muted-foreground",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FieldError>{error}</FieldError>
    </View>
  );
}
