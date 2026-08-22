import type { ReactNode } from "react";
import { useEffect } from "react";
import { AccessibilityInfo, ActivityIndicator, View } from "react-native";

import { useTheme } from "../theme";
import { Button } from "./Button";
import { Text } from "./Text";

export function LoadingState() {
  const theme = useTheme();

  return (
    <View
      // On iOS, `isAccessibilityElement` follows `accessible`, which
      // defaults to false on a View — without it, `accessibilityRole` and
      // `accessibilityLabel` below are never surfaced to VoiceOver at all.
      accessible
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

  // `accessibilityRole="alert"` does nothing on iOS unless the node is an
  // accessibility element (see the `accessible` note below — we deliberately
  // don't make it one), and `accessibilityLiveRegion` only does anything on
  // Android. An imperative announcement is the only mechanism that reliably
  // reaches VoiceOver, so fire one whenever the message appears or changes.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      // Deliberately not `accessible`: unlike LoadingState, this container
      // has an interactive child (the retry Button). Making the View a
      // single accessibility element would absorb that Button and make it
      // unreachable by swipe navigation. `accessibilityRole="alert"` plus
      // `accessibilityLiveRegion` still help on Android (and cost nothing on
      // iOS) without needing the container itself to become one opaque
      // element; the `announceForAccessibility` call above covers iOS.
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
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
