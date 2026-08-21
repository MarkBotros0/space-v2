import { ActivityIndicator, Pressable } from "react-native";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";

import { useTheme } from "../theme";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends Omit<PressableProps, "onPress" | "style" | "disabled"> {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const variantStyle: Record<ButtonVariant, ViewStyle> = {
    primary: {
      backgroundColor: theme.colors.brand.navy[900],
      borderWidth: theme.borderWidths.none,
    },
    secondary: {
      backgroundColor: theme.colors.brand.teal[500],
      borderWidth: theme.borderWidths.none,
    },
    ghost: {
      backgroundColor: theme.colors.transparent,
      borderWidth: theme.borderWidths.thin,
      borderColor: theme.colors.neutral[300],
    },
  };

  const textColor: Record<ButtonVariant, string> = {
    primary: theme.colors.white,
    secondary: theme.colors.brand.navy[900],
    ghost: theme.colors.neutral[900],
  };

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={() => {
        if (isDisabled) return;
        onPress();
      }}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radii.md,
          // iOS HIG wants 44pt, Android 48dp, WCAG 2.5.5 wants 44x44 minimum
          // touch targets. paddingVertical(8) + label lineHeight(18) alone
          // is only 34 — this floor makes that impossible to regress silently.
          minHeight: 44,
          opacity: isDisabled ? theme.opacity.disabled : theme.opacity.full,
          ...variantStyle[variant],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor[variant]} /> : null}
      <Text variant="label" color={textColor[variant]}>
        {title}
      </Text>
    </Pressable>
  );
}
