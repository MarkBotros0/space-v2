/**
 * Port of v1 src/components/ui/progress-ring.tsx — same radius, stroke and
 * dash maths.
 * Native differences: react-native-svg; v1's -rotate-90 on the svg becomes a
 * rotation transform on the circles' group; the stroke transition is dropped.
 * Porting rule for callers: v1 `stroke-[var(--color-X)]` → `stroke-X`
 * (e.g. "stroke-error-500"); NativeWind maps it onto the circle's stroke prop.
 */
import { cssInterop } from "nativewind";
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, type CircleProps, G } from "react-native-svg";

import { cn } from "../lib/cn";

/** Circle whose stroke colour comes from a `stroke-*` class via NativeWind. */
function StrokeCircle({ style, ...props }: Omit<CircleProps, "stroke" | "style"> & { className?: string; style?: { stroke?: string } }) {
  return <Circle {...props} stroke={style?.stroke} />;
}
cssInterop(StrokeCircle, { className: "style" });

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
          <StrokeCircle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-border" />
          <StrokeCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className={cn("stroke-brand-teal-500", indicatorClassName)}
          />
        </G>
      </Svg>
      {children != null ? (
        <View className="absolute inset-0 flex-col items-center justify-center">{children}</View>
      ) : null}
    </View>
  );
}
