import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import { useTheme } from "../theme";
import { Button } from "./Button";
import { Text } from "./Text";

export function LoadingState() {
  const theme = useTheme();

  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.xl,
      }}
    >
      <ActivityIndicator color={theme.colors.brand.navy[900]} />
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.xl,
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="heading">{title}</Text>
      <Text variant="body" color={theme.colors.neutral[600]}>
        {message}
      </Text>
      {action}
    </View>
  );
}

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.xl,
        gap: theme.spacing.md,
      }}
    >
      <Text variant="body" color={theme.colors.error[600]}>
        {message}
      </Text>
      <Button title="Try again" onPress={onRetry} variant="secondary" />
    </View>
  );
}
