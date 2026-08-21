import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { useTheme } from "../theme";

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** When provided, the Card renders as a Pressable so tappable list rows don't have to re-derive one. */
  onPress?: () => void;
}

export function Card({ children, style, onPress }: CardProps) {
  const theme = useTheme();

  const cardStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: theme.colors.white,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.md,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={cardStyle}>
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}
