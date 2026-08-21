import type { ReactNode } from "react";
import { Text as RNText } from "react-native";
import type { TextProps as RNTextProps, TextStyle } from "react-native";

import { useTheme } from "../theme";

export type TextVariant = "display" | "title" | "heading" | "body" | "label" | "caption";

export interface TextProps extends Omit<RNTextProps, "children"> {
  variant?: TextVariant;
  color?: string;
  children: ReactNode;
}

export function Text({ variant = "body", color, style, children, ...rest }: TextProps) {
  const theme = useTheme();
  const scale = theme.typography[variant];

  const textStyle: TextStyle = {
    fontSize: scale.fontSize,
    lineHeight: scale.lineHeight,
    fontWeight: scale.fontWeight,
    color: color ?? theme.colors.neutral[900],
  };

  return (
    <RNText style={[textStyle, style]} {...rest}>
      {children}
    </RNText>
  );
}
