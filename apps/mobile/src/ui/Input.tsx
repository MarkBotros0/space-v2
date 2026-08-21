import { TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";

import { useTheme } from "../theme";
import { Text } from "./Text";

export interface InputProps extends Omit<TextInputProps, "value" | "onChangeText"> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}

export function Input({ label, value, onChangeText, error, ...rest }: InputProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" color={theme.colors.neutral[700]}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.neutral[400]}
        style={{
          borderWidth: 1,
          borderColor: error ? theme.colors.error[500] : theme.colors.neutral[300],
          borderRadius: theme.radii.sm,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          fontSize: theme.typography.body.fontSize,
          color: theme.colors.neutral[900],
        }}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color={theme.colors.error[600]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
