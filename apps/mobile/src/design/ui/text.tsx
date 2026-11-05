/**
 * Base text. v1 sets `body { @apply text-foreground; font-feature-settings:
 * "ss01", "ss03" }` on top of the browser's 16px / Tailwind's 1.5 line
 * height, and every element inherits it; React Native text inherits
 * nothing from its parent View, so every ported component renders this
 * instead of react-native's Text.
 * Native differences: ss01/ss03 map to fontVariant stylistic-one/-three.
 */
import { Text as RNText, type TextProps, type TextStyle } from "react-native";

import tokens from "../theme/tokens.json";
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
type Variant = "largeTitle" | "title" | "headline" | "body" | "subhead" | "caption";
// Size classes come from tokens.json fontSize (tailwind-theme.js); weights use
// the font-* utilities because each Geist weight is its own font file.
// body renders as text-base (same 16/24 as text-body) so existing call sites
// and their class assertions are unchanged.
const VARIANTS: Record<Variant, { size: string; weight: string }> = {
  largeTitle: { size: "large-title", weight: "font-extrabold" },
  title: { size: "title", weight: "font-semibold" },
  headline: { size: "headline", weight: "font-semibold" },
  body: { size: "base", weight: "font-normal" },
  subhead: { size: "subhead", weight: "font-normal" },
  caption: { size: "caption", weight: "font-normal" },
};
const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

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
    const scale = /^text-(large-title|title|headline|body|subhead|caption)$/.exec(c);
    if (scale) size = tokens.fontSize[scale[1] as keyof typeof tokens.fontSize].size;
    const px = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(c);
    if (px) size = Number(px[1]);
    const rem = /^text-\[(\d+(?:\.\d+)?)rem\]$/.exec(c);
    if (rem) size = Number(rem[1]) * 16;
  }
  return em === undefined ? null : { letterSpacing: em * size };
}

// The size the merged classes settle on, when it is a type-scale class. Jest
// (and any caller reading style) cannot see compiled classes, so the scale's
// size and line height are also set inline, but only for an explicit `variant`
// (a default Text leaves sizing to its compiled classes, so existing leading-*
// and size overrides keep working), only while a scale class wins, and never
// a line height over a caller leading-*:
// a caller's text-sm drops the variant class and so the inline size too.
function scaleStyleFor(classes: string[]): TextStyle | null {
  const hasLeading = classes.some((c) => /^leading-/.test(c));
  for (const c of classes) {
    const m = /^text-(large-title|title|headline|body|base|subhead|caption)$/.exec(c);
    if (m) {
      const { size, lineHeight } = tokens.fontSize[(m[1] === "base" ? "body" : m[1]) as keyof typeof tokens.fontSize];
      return hasLeading ? { fontSize: size } : { fontSize: size, lineHeight };
    }
  }
  return null;
}

type Props = TextProps & { className?: string; variant?: Variant; tabular?: boolean };

function Text({ className, style, variant, tabular = false, ...props }: Props) {
  // font-normal sets the Geist face too; with font-mono it would win the
  // fontFamily cascade, so mono text starts from colour only.
  const mono = className?.split(" ").includes("font-mono") ?? false;
  const v = VARIANTS[variant ?? "body"];
  const weight = mono && v.weight === "font-normal" ? "" : v.weight;
  const merged = cn(weight, `text-${v.size} text-foreground`, className);
  const classes = merged.split(/\s+/);
  const tracking = letterSpacingFor(classes);
  return (
    <RNText
      className={merged}
      style={[BODY_FEATURES, variant ? scaleStyleFor(classes) : null, tabular && TABULAR, mono && MONO, tracking, style]}
      {...props}
    />
  );
}

export { Text };
