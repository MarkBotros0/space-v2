// apps/mobile/src/components/charts/TrendLine.tsx
import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import { useTheme } from "../../theme";

export interface TrendPoint {
  label: string;
  pct: number | null;
}

export interface TrendLineProps {
  points: TrendPoint[];
  height?: number;
}

/**
 * A line, drawn on react-native-svg.
 *
 * Not a chart library (D-17.20): of v1's four Recharts cards, spec §9 already
 * replaces two with lists, leaving one line and one four-slice donut. A
 * library would add react-native-linear-gradient — a native module — to the dev
 * client for gradients nothing here uses, and would put every colour behind a
 * prop surface when they must all come from the theme.
 *
 * `accessibilityLabel` describes the SERVED values, so a screen reader gets the
 * data and the screen test can assert on numbers rather than on SVG geometry.
 *
 * Points with a null pct (nobody enrolled yet — D-17.13) are skipped rather
 * than plotted at zero; the line closes over the gap and the label says how
 * many sessions carried a figure.
 */
export function TrendLine({ points, height = 160 }: TrendLineProps) {
  const theme = useTheme();
  const plotted = points
    .map((p, i) => ({ ...p, i }))
    .filter((p): p is TrendPoint & { i: number; pct: number } => p.pct !== null);

  const width = 320;
  const pad = 8;
  const x = (i: number) =>
    points.length <= 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (pct: number) => pad + (1 - pct / 100) * (height - pad * 2);

  const label =
    plotted.length === 0
      ? "Attendance trend, no data"
      : `Attendance trend, ${plotted.length} session${plotted.length === 1 ? "" : "s"}, from ${plotted[0]!.pct}% to ${plotted[plotted.length - 1]!.pct}%`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 50, 100].map((tick) => (
          <Line
            key={tick}
            x1={pad}
            x2={width - pad}
            y1={y(tick)}
            y2={y(tick)}
            stroke={theme.colors.neutral[200]}
            strokeWidth={1}
          />
        ))}
        {plotted.length > 1 ? (
          <Polyline
            points={plotted.map((p) => `${x(p.i)},${y(p.pct)}`).join(" ")}
            fill="none"
            stroke={theme.colors.brand.teal[700]}
            strokeWidth={2}
          />
        ) : null}
        {plotted.map((p) => (
          <Circle
            key={p.i}
            cx={x(p.i)}
            cy={y(p.pct)}
            r={3}
            fill={theme.colors.brand.teal[700]}
          />
        ))}
      </Svg>
    </View>
  );
}
