import { Pressable, View } from "react-native";

import { useTheme } from "../theme";
import { Text } from "../ui";

export interface ChoiceOption<T> {
  value: T;
  label: string;
}

export interface ChoiceChipsProps<T> {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  error?: string;
}

/**
 * A single-choice row of chips — the season picker on the student forms and
 * the role picker on /users/new. Each chip is a radio with its selected state
 * in accessibilityState, so a screen reader hears the choice and tests can
 * query it by role.
 */
export function ChoiceChips<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
  error,
}: ChoiceChipsProps<T>) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="label" color={theme.colors.neutral[700]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{
                paddingVertical: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radii.sm,
                borderWidth: theme.borderWidths.thin,
                borderColor: selected ? theme.colors.brand.navy[900] : theme.colors.neutral[300],
              }}
            >
              <Text variant="label" color={selected ? theme.colors.brand.navy[900] : theme.colors.neutral[700]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
