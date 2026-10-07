// apps/mobile/src/components/charts/BandDonut.tsx
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { EngagementBand } from "@space/shared";
import { BAND_LABEL } from "@space/shared";

import { bandColor } from "../../lib/report-colors";
import { useTheme } from "../../theme";

export interface BandDonutProps {
  bands: Array<{ band: EngagementBand; count: number }>;
  size?: number;
}

/**
 * Four arcs on one circle, coloured from the explicit band map (R92).
 *
 * A donut is kept only because this category count is FIXED at four. v1's other
 * two pies — one slice per season, one per graduation year — are replaced by
 * ranked lists: labelled slices overlap on a 240 px square past four categories
 * and the palette wraps back to green on the fifth, implying a severity ranking
 * that does not exist (R93, R97, spec §9).
 */
export function BandDonut({ bands, size = 160 }: BandDonutProps) {
  const theme = useTheme();
  const total = bands.reduce((n, b) => n + b.count, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const label =
    total === 0
      ? "Engagement bands, no data"
      : `Engagement bands: ${bands.map((b) => `${BAND_LABEL[b.band]} ${b.count}`).join(", ")}`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.colors.neutral[200]}
          strokeWidth={16}
        />
        {total > 0
          ? bands.map((b) => {
              const dash = (b.count / total) * c;
              const el = (
                <Circle
                  key={b.band}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={bandColor(theme, b.band)}
                  strokeWidth={16}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  // Start at 12 o'clock rather than 3.
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              offset += dash;
              return el;
            })
          : null}
      </Svg>
    </View>
  );
}
