/**
 * Base text. v1 sets `body { @apply text-foreground; font-feature-settings:
 * "ss01", "ss03" }` on top of the browser's 16px / Tailwind's 1.5 line
 * height, and every element inherits it; React Native text inherits
 * nothing from its parent View, so every ported component renders this
 * instead of react-native's Text.
 * Native differences: ss01/ss03 map to fontVariant stylistic-one/-three.
 */
import { Text as RNText, type TextProps, type TextStyle } from "react-native";

import { cn } from "../lib/cn";

const BODY_FEATURES: TextStyle = { fontVariant: ["stylistic-one", "stylistic-three"] };
// NativeWind compiles `font-mono` correctly but the face does not reach the
// native Text at runtime (Geist faces via font-normal… do); set it directly.
const MONO: TextStyle = { fontFamily: "GeistMono_400Regular" };

function Text({ className, style, ...props }: TextProps & { className?: string }) {
  // font-normal sets the Geist face too; with font-mono it would win the
  // fontFamily cascade, so mono text starts from colour only.
  const mono = className?.split(" ").includes("font-mono") ?? false;
  const base = mono ? "text-base text-foreground" : "font-normal text-base text-foreground";
  return <RNText className={cn(base, className)} style={[BODY_FEATURES, mono && MONO, style]} {...props} />;
}

export { Text };
