import type { ReactNode } from "react";
import { Text as RNText } from "react-native";
import type { TextProps as RNTextProps, TextStyle } from "react-native";

import { useTheme } from "../theme";
import type { typography } from "../theme/tokens";

// Derived from the type scale itself rather than hand-written, so adding a
// step to `typography` in tokens.ts can't leave that step unreachable here.
export type TextVariant = keyof typeof typography;

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
