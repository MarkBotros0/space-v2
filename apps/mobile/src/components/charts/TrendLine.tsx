// apps/mobile/src/components/charts/TrendLine.tsx
import { View } from "react-native";
import Svg, { Circle, G, Line, Polyline } from "react-native-svg";

import { useTheme } from "../../theme";
import { Text } from "../../ui";

export interface TrendPoint {
  label: string;
  pct: number | null;
  /** Which line this point belongs to (e.g. a season). Points without one share a single line. */
  series?: { key: string; label: string };
}

export interface TrendLineProps {
  points: TrendPoint[];
  height?: number;
}

interface Placed extends TrendPoint {
  /** Position along the shared x axis: the point's place in the served order. */
  i: number;
}

/**
 * Lines, drawn on react-native-svg.
 *
 * Not a chart library (D-17.20): of v1's four Recharts cards, spec §9 already
 * replaces two with lists, leaving one line and one four-slice donut. A
 * library would add react-native-linear-gradient — a native module — to the dev
 * client for gradients nothing here uses, and would put every colour behind a
 * prop surface when they must all come from the theme.
 *
 * One line per series (REG-117): points from different seasons are never
 * joined, so a two-season scope draws two lines (each in its own colour, with
 * a legend) instead of one zig-zag between them. All series share one x axis,
 * the served (chronological) order.
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
  const palette = [
    theme.colors.brand.teal[700],
    theme.colors.brand.navy[600],
    theme.colors.warning[600],
    theme.colors.success[600],
    theme.colors.info[600],
    theme.colors.error[500],
  ];

  const seriesMap = new Map<string, { label: string; plotted: (Placed & { pct: number })[] }>();
  points.forEach((p, i) => {
    const key = p.series?.key ?? "";
    let entry = seriesMap.get(key);
    if (!entry) {
      entry = { label: p.series?.label ?? "", plotted: [] };
      seriesMap.set(key, entry);
    }
    if (p.pct !== null) entry.plotted.push({ ...p, i, pct: p.pct });
  });
  const series = Array.from(seriesMap.values());

  const width = 320;
  const pad = 8;
  const x = (i: number) =>
    points.length <= 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (pct: number) => pad + (1 - pct / 100) * (height - pad * 2);

  const describe = (plotted: Placed[]) =>
    plotted.length === 0
      ? "no data"
      : `${plotted.length} session${plotted.length === 1 ? "" : "s"}, from ${plotted[0]!.pct}% to ${plotted[plotted.length - 1]!.pct}%`;

  const label =
    series.length <= 1
      ? `Attendance trend, ${describe(series[0]?.plotted ?? [])}`
      : `Attendance trend, ${series.length} seasons. ${series
          .map((s) => `${s.label}: ${describe(s.plotted)}`)
          .join(". ")}`;

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
        {series.map((s, k) => {
          const color = palette[k % palette.length]!;
          return (
            <G key={s.label + k}>
              {s.plotted.length > 1 ? (
                <Polyline
                  points={s.plotted.map((p) => `${x(p.i)},${y(p.pct)}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              ) : null}
              {s.plotted.map((p) => (
                <Circle key={p.i} cx={x(p.i)} cy={y(p.pct)} r={3} fill={color} />
              ))}
            </G>
          );
        })}
      </Svg>
      {series.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {series.map((s, k) => (
            <Text key={s.label + k} variant="caption" color={palette[k % palette.length]}>
              {`● ${s.label}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
