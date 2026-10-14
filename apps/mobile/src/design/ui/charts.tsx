/**
 * Port of v1 src/components/ui/charts.tsx (Recharts) with react-native-svg,
 * reproducing Recharts' defaults as v1 configures them: margin
 * {top 8, right 16, left 0, bottom 8}, 60px Y axis, 30px X axis, 5 "nice" Y
 * ticks, 12px ticks in neutral-600, horizontal grid and axis lines in
 * neutral-200, bars in brand-teal-500 with radius [4,4,0,0] and a 10%
 * category gap, a monotone line in brand-teal-700 (2px, r=3 dots), and pie
 * slices at outerRadius 80 labelled outside by name in the slice colour.
 * Colours are v1's lib/chart-colors.ts hexes (they differ slightly from the
 * theme tokens — v1 mirrors an older palette).
 * Native differences: tooltips (hover) are dropped.
 */
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import Svg, { G, Line, Path, Circle as SvgCircle, Text as SvgText } from "react-native-svg";

import { cn } from "../lib/cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Text } from "./text";

export const chartColors = {
  brandNavy: { 300: "#8C9FC6", 500: "#4A639B", 700: "#324D87", 900: "#22355F" },
  brandTeal: { 300: "#A6E0E2", 500: "#67CBCD", 700: "#3A9698" },
  success: { 500: "#10B981", 700: "#047857" },
  warning: { 500: "#F59E0B", 700: "#B45309" },
  error: { 500: "#EF4444", 700: "#B91C1C" },
  info: { 500: "#3B82F6", 700: "#1D4ED8" },
  neutral: { 200: "#E5E7EB", 400: "#9CA3AF", 600: "#4B5563", 900: "#111827" },
} as const;

export const categoricalPalette = [
  chartColors.success[500],
  chartColors.brandTeal[500],
  chartColors.warning[500],
  chartColors.error[500],
  chartColors.brandNavy[500],
];

const MARGIN = { top: 8, right: 16, left: 0, bottom: 8 };
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;
const TICK = { fontSize: 12, fill: chartColors.neutral[600], fontFamily: "Geist_400Regular" };

/** Recharts' getNiceTickValues for a [0, max] domain with tickCount 5. */
export function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4].slice(0, count);
  const rough = max / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  return Array.from({ length: count }, (_, i) => Number((i * step).toFixed(10)));
}

/** d3 curveMonotoneX, the curve Recharts draws for type="monotone". */
function monotonePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
  const n = pts.length;
  const dx = (i: number) => pts[i + 1]!.x - pts[i]!.x;
  const slope = (i: number) => (pts[i + 1]!.y - pts[i]!.y) / (dx(i) || 1);
  const t: number[] = new Array(n);
  t[0] = slope(0);
  t[n - 1] = slope(n - 2);
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope(i - 1);
    const s1 = slope(i);
    const h0 = dx(i - 1);
    const h1 = dx(i);
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  if (n === 2) t[0] = t[1] = slope(0);
  else {
    t[0] = (3 * slope(0) - t[1]!) / 2;
    t[n - 1] = (3 * slope(n - 2) - t[n - 2]!) / 2;
  }
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx(i) / 3;
    d += `C${pts[i]!.x + h},${pts[i]!.y + h * t[i]!},${pts[i + 1]!.x - h},${pts[i + 1]!.y - h * t[i + 1]!},${pts[i + 1]!.x},${pts[i + 1]!.y}`;
  }
  return d;
}

function ChartCard({
  title,
  description,
  className,
  height,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  height: number;
  children: (width: number) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <View style={{ width: "100%", height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {children(width || 300)}
        </View>
      </CardContent>
    </Card>
  );
}

type Datum = Record<string, string | number>;

function CartesianFrame({ width, height, data, xKey, ticks, bandX }: { width: number; height: number; data: Datum[]; xKey: string; ticks: number[]; bandX: (i: number) => number }) {
  const plotTop = MARGIN.top;
  const plotBottom = height - MARGIN.bottom - X_AXIS_HEIGHT;
  const left = MARGIN.left + Y_AXIS_WIDTH;
  const right = width - MARGIN.right;
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => plotBottom - (v / top) * (plotBottom - plotTop);
  return (
    <G>
      {ticks.map((t) => (
        <G key={t}>
          <Line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke={chartColors.neutral[200]} />
          <SvgText {...TICK} x={left - 8} y={y(t) + 4} textAnchor="end">
            {String(t)}
          </SvgText>
        </G>
      ))}
      <Line x1={left} x2={left} y1={plotTop} y2={plotBottom} stroke={chartColors.neutral[200]} />
      <Line x1={left} x2={right} y1={plotBottom} y2={plotBottom} stroke={chartColors.neutral[200]} />
      {data.map((d, i) => (
        <SvgText key={i} {...TICK} x={bandX(i)} y={plotBottom + 16} textAnchor="middle">
          {String(d[xKey])}
        </SvgText>
      ))}
    </G>
  );
}

export function BarChartCard({
  title,
  description,
  className,
  height = 240,
  data,
  xKey,
  yKey,
}: {
  title: string;
  description?: string;
  className?: string;
  height?: number;
  data: Datum[];
  xKey: string;
  yKey: string;
}) {
  return (
    <ChartCard title={title} description={description} className={className} height={height}>
      {(width) => {
        const left = MARGIN.left + Y_AXIS_WIDTH;
        const right = width - MARGIN.right;
        const band = (right - left) / Math.max(1, data.length);
        const gap = band * 0.1;
        const barW = band - 2 * gap;
        const plotTop = MARGIN.top;
        const plotBottom = height - MARGIN.bottom - X_AXIS_HEIGHT;
        const ticks = niceTicks(Math.max(0, ...data.map((d) => Number(d[yKey]) || 0)));
        const top = ticks[ticks.length - 1] || 1;
        return (
          <Svg width={width} height={height}>
            <CartesianFrame width={width} height={height} data={data} xKey={xKey} ticks={ticks} bandX={(i) => left + band * i + band / 2} />
            {data.map((d, i) => {
              const v = Number(d[yKey]) || 0;
              const h = (v / top) * (plotBottom - plotTop);
              const x = left + band * i + gap;
              const yTop = plotBottom - h;
              const r = Math.min(4, h, barW / 2);
              const path = `M${x},${plotBottom}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barW - r}Q${x + barW},${yTop} ${x + barW},${yTop + r}V${plotBottom}Z`;
              return <Path key={i} testID="bar" d={path} fill={chartColors.brandTeal[500]} />;
            })}
          </Svg>
        );
      }}
    </ChartCard>
  );
}

export function LineChartCard({
  title,
  description,
  className,
  height = 240,
  data,
  xKey,
  yKey,
  yLabel,
}: {
  title: string;
  description?: string;
  className?: string;
  height?: number;
  data: Datum[];
  xKey: string;
  yKey: string;
  yLabel?: string;
}) {
  return (
    <ChartCard title={title} description={description} className={className} height={height}>
      {(width) => {
        const left = MARGIN.left + Y_AXIS_WIDTH;
        const right = width - MARGIN.right;
        const plotTop = MARGIN.top;
        const plotBottom = height - MARGIN.bottom - X_AXIS_HEIGHT;
        const ticks = niceTicks(Math.max(0, ...data.map((d) => Number(d[yKey]) || 0)));
        const top = ticks[ticks.length - 1] || 1;
        // Recharts' point scale: first and last points sit on the plot edges.
        const x = (i: number) => (data.length <= 1 ? (left + right) / 2 : left + ((right - left) * i) / (data.length - 1));
        const pts = data.map((d, i) => ({ x: x(i), y: plotBottom - ((Number(d[yKey]) || 0) / top) * (plotBottom - plotTop) }));
        return (
          <Svg width={width} height={height}>
            <CartesianFrame width={width} height={height} data={data} xKey={xKey} ticks={ticks} bandX={x} />
            {yLabel ? (
              <SvgText {...TICK} x={12} y={(plotTop + plotBottom) / 2} textAnchor="middle" rotation={-90} origin={`12, ${(plotTop + plotBottom) / 2}`}>
                {yLabel}
              </SvgText>
            ) : null}
            <Path d={monotonePath(pts)} stroke={chartColors.brandTeal[700]} strokeWidth={2} fill="none" />
            {pts.map((p, i) => (
              <SvgCircle key={i} cx={p.x} cy={p.y} r={3} fill={chartColors.brandTeal[700]} stroke={chartColors.brandTeal[700]} />
            ))}
          </Svg>
        );
      }}
    </ChartCard>
  );
}

export function PieChartCard({
  title,
  description,
  className,
  height = 240,
  data,
}: {
  title: string;
  description?: string;
  className?: string;
  height?: number;
  data: { name: string; value: number }[];
}) {
  return (
    <ChartCard title={title} description={description} className={className} height={height}>
      {(width) => {
        const cx = width / 2;
        const cy = height / 2;
        const r = 80;
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        const RAD = Math.PI / 180;
        // Recharts polar angles: 0° at 3 o'clock, counter-clockwise, y flipped.
        const at = (radius: number, deg: number) => ({ x: cx + radius * Math.cos(-deg * RAD), y: cy + radius * Math.sin(-deg * RAD) });
        let start = 0;
        return (
          <Svg width={width} height={height}>
            {data.map((d, i) => {
              const sweep = (d.value / total) * 360;
              const end = start + sweep;
              const a = at(r, start);
              const b = at(r, end);
              const large = sweep > 180 ? 1 : 0;
              const fill = categoricalPalette[i % categoricalPalette.length]!;
              const path =
                sweep >= 359.999
                  ? `M${cx - r},${cy}A${r},${r} 0 1,0 ${cx + r},${cy}A${r},${r} 0 1,0 ${cx - r},${cy}Z`
                  : `M${cx},${cy}L${a.x},${a.y}A${r},${r} 0 ${large},0 ${b.x},${b.y}Z`;
              const mid = start + sweep / 2;
              const label = at(r + 20, mid);
              const cos = Math.cos(-mid * RAD);
              start = end;
              return (
                <G key={d.name}>
                  <Path testID="slice" d={path} fill={fill} stroke="#fff" strokeWidth={1} />
                  <SvgText
                    x={label.x}
                    y={label.y + 4}
                    fontSize={12}
                    fontFamily="Geist_400Regular"
                    fill={fill}
                    textAnchor={cos >= 0 ? "start" : "end"}
                  >
                    {d.name}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        );
      }}
    </ChartCard>
  );
}

export interface ChartLegendItem {
  label: string;
  color: string;
}

export function ChartLegend({ items, className }: { items: ChartLegendItem[]; className?: string }) {
  return (
    <View className={cn("mt-2 flex-row flex-wrap gap-3", className)}>
      {items.map((i) => (
        <View key={i.label} className="flex-row items-center gap-1.5">
          <View className="size-2.5 rounded-full" style={{ backgroundColor: i.color }} />
          <Text className="text-xs text-muted-foreground">{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
