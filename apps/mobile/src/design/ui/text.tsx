/**
 * Base text. v1 sets `body { @apply text-foreground; font-feature-settings:
 * "ss01", "ss03" }` and every element inherits it; React Native text inherits
 * nothing from its parent View, so every ported component renders this
 * instead of react-native's Text.
 * Native differences: ss01/ss03 map to fontVariant stylistic-one/-three.
 */
import { Text as RNText, type TextProps, type TextStyle } from "react-native";

import { cn } from "../lib/cn";

const BODY_FEATURES: TextStyle = { fontVariant: ["stylistic-one", "stylistic-three"] };

function Text({ className, style, ...props }: TextProps & { className?: string }) {
  // font-normal sets the Geist face too; with font-mono it would win the
  // fontFamily cascade, so mono text starts from colour only.
  const base = className?.split(" ").includes("font-mono") ? "text-foreground" : "font-normal text-foreground";
  return <RNText className={cn(base, className)} style={[BODY_FEATURES, style]} {...props} />;
}

export { Text };
