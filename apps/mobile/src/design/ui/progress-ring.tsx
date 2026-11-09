/**
 * Port of v1 src/components/ui/progress-ring.tsx — same radius, stroke and
 * dash maths.
 * Native differences: react-native-svg; v1's -rotate-90 on the svg becomes a
 * rotation transform on the circles' group; the stroke transition is dropped.
 * Porting rule for callers: v1 `stroke-[var(--color-X)]` → `stroke-X`
 * (e.g. "stroke-error-500"); the colour is resolved from the generated theme.
 */
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { cn } from "../lib/cn";
import { Text } from "./text";

const { colors, semantic } = require("../theme/tailwind-theme.js") as {
  colors: Record<string, Record<string, string> | string>;
  semantic: Record<"light" | "dark", Record<string, string>>;
};

/**
 * Resolves a `stroke-<ramp>-<step>` or `stroke-<semantic>` class to a colour.
 * NativeWind consumes `stroke-*` classes on svg elements without producing a
 * style, so the ring is coloured here from the generated theme instead.
 */
function strokeColor(className: string, scheme: "light" | "dark"): string | undefined {
  const name = className.trim().replace(/^stroke-/, "");
  const semanticColor = semantic[scheme][name];
  if (semanticColor) return semanticColor;
  const m = /^(.*)-(\d{2,3})$/.exec(name);
  if (!m) return undefined;
  const ramp = colors[m[1]!];
  return typeof ramp === "object" ? ramp[m[2]!] : undefined;
}

/** Clear space between the stroke's inner edge and the labels inside the ring. */
const CONTENT_INSET = 6;

/**
 * Width of the box the labels sit in: the widest box whose corners stay
 * CONTENT_INSET inside the stroke's inner edge, for a stack of labels about
 * as tall as the inner radius (the figure and its caption). The labels used
 * to span the whole inner diameter at its middle, so "100%" and "ATTENDANCE"
 * touched the stroke at the corners (device sweep, leader s10-01, admin s20-01).
 * 104/9 (the default ring): inner radius 43 → 60dp across.
 */
export function ringContentWidth(size: number, strokeWidth: number): number {
  const inner = size / 2 - strokeWidth;
  const reach = inner - CONTENT_INSET;
  const halfHeight = inner / 2;
  return Math.floor(2 * Math.sqrt(Math.max(0, reach * reach - halfHeight * halfHeight)));
}

/**
 * One line that shrinks to fit the ring's inside rather than wrapping: a
 * word never breaks mid-word, and font scaling stops at 1.15x since the ring
 * is a fixed size (rule "cap font scaling where a fixed-size container holds
 * the text").
 */
const FIT = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.6,
  maxFontSizeMultiplier: 1.15,
} as const;

/** The figure in the middle of a ring ("100%"): 20/24, so figure and caption fit the box. */
export function RingValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      {...FIT}
      className={cn(
        "self-stretch text-center text-xl leading-6 font-black text-brand-navy-900 dark:text-foreground",
        className,
      )}
    >
      {children}
    </Text>
  );
}

/** The caption under a ring's figure ("ATTENDANCE"). */
export function RingCaption({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      {...FIT}
      variant="caption"
      className={cn(
        "mt-1 self-stretch text-center font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </Text>
  );
}

export function ProgressRing({
  value,
  size = 104,
  strokeWidth = 9,
  className,
  indicatorClassName,
  label,
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  indicatorClassName?: string;
  label?: string;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const scheme = useColorScheme().colorScheme === "dark" ? "dark" : "light";
  const lastStroke = (indicatorClassName ?? "")
    .split(/\s+/)
    .filter((c) => c.startsWith("stroke-"))
    .pop();
  const indicator = (lastStroke && strokeColor(lastStroke, scheme)) ?? strokeColor("stroke-brand-teal-500", scheme);
  const track = strokeColor("stroke-border", scheme);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? `${Math.round(clamped)} percent`}
      className={cn("relative shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} stroke={track} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            stroke={indicator}
          />
        </G>
      </Svg>
      {children != null ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View
            testID="ring-content"
            className="flex-col items-center"
            style={{ width: ringContentWidth(size, strokeWidth) }}
          >
            {children}
          </View>
        </View>
      ) : null}
    </View>
  );
}
