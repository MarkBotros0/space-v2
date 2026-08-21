import { ActivityIndicator, Pressable } from "react-native";
import type { ViewStyle } from "react-native";

import { useTheme } from "../theme";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const variantStyle: Record<ButtonVariant, ViewStyle> = {
    primary: {
      backgroundColor: theme.colors.brand.navy[900],
      borderWidth: 0,
    },
    secondary: {
      backgroundColor: theme.colors.brand.teal[500],
      borderWidth: 0,
    },
    ghost: {
      backgroundColor: "transparent",
      borderWidth: 1,
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
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={() => {
        if (isDisabled) return;
        onPress();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radii.md,
        opacity: isDisabled ? 0.6 : 1,
        ...variantStyle[variant],
      }}
    >
      {loading ? <ActivityIndicator color={textColor[variant]} /> : null}
      <Text variant="label" color={textColor[variant]}>
        {title}
      </Text>
    </Pressable>
  );
}
