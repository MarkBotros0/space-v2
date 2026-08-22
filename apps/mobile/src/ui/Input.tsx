import { TextInput, View } from "react-native";
import type { StyleProp, TextInputProps, TextStyle } from "react-native";

import { useTheme } from "../theme";
import { Text } from "./Text";

export interface InputProps extends Omit<TextInputProps, "value" | "onChangeText"> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}

export function Input({ label, value, onChangeText, error, style, ...rest }: InputProps) {
  const theme = useTheme();

  const baseStyle: TextStyle = {
    borderWidth: theme.borderWidths.thin,
    borderColor: error ? theme.colors.error[500] : theme.colors.neutral[300],
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.neutral[900],
  };

  const mergedStyle: StyleProp<TextStyle> = [baseStyle, style];

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {/*
       * The field itself carries `accessibilityLabel={label}` below, so this
       * visual label is a duplicate for screen readers — without hiding it,
       * VoiceOver/TalkBack reads the label twice (once as static text, once
       * as the field's own label). `getByLabelText(label)` must keep
       * resolving to the TextInput only; hiding this Text doesn't change that.
       */}
      <Text
        variant="label"
        color={theme.colors.neutral[700]}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.neutral[400]}
        {...rest}
        style={mergedStyle}
      />
      {error ? (
        // The field itself carries `accessibilityHint={error}` above, so
        // this caption is a duplicate for screen readers too — without
        // hiding it, focusing the field reads "Email, Required" and then
        // swiping past reads "Required" again. Hidden the same way the
        // visual label above is; `getByLabelText(label)` still resolves to
        // just the field.
        <Text
          variant="caption"
          color={theme.colors.error[600]}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
