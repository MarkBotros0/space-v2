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

// Tailwind's tracking-* scale is in em. NativeWind drops em letter spacing, so
// it is resolved here as em × the class's font size (default 16px).
const TRACKING_EM: Record<string, number> = {
  tighter: -0.05,
  tight: -0.025,
  normal: 0,
  wide: 0.025,
  wider: 0.05,
  widest: 0.1,
};
const SIZE_PX: Record<string, number> = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48,
};

function letterSpacingFor(classes: string[]): TextStyle | null {
  let em: number | undefined;
  let size = 16;
  for (const c of classes) {
    const t = /^tracking-(\w+)$/.exec(c);
    if (t && t[1]! in TRACKING_EM) em = TRACKING_EM[t[1]!];
    const named = /^text-(xs|sm|base|lg|xl|[2-5]xl)$/.exec(c);
    if (named) size = SIZE_PX[named[1]!]!;
    const px = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(c);
    if (px) size = Number(px[1]);
    const rem = /^text-\[(\d+(?:\.\d+)?)rem\]$/.exec(c);
    if (rem) size = Number(rem[1]) * 16;
  }
  return em === undefined ? null : { letterSpacing: em * size };
}

function Text({ className, style, ...props }: TextProps & { className?: string }) {
  // font-normal sets the Geist face too; with font-mono it would win the
  // fontFamily cascade, so mono text starts from colour only.
  const mono = className?.split(" ").includes("font-mono") ?? false;
  const base = mono ? "text-base text-foreground" : "font-normal text-base text-foreground";
  const merged = cn(base, className);
  const tracking = letterSpacingFor(merged.split(/\s+/));
  return <RNText className={merged} style={[BODY_FEATURES, mono && MONO, tracking, style]} {...props} />;
}

export { Text };
