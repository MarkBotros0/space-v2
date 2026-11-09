// apps/mobile/src/components/charts/RankedBars.tsx
import { View } from "react-native";

import { Text } from "../../design/ui/text";
import { palette } from "../../design/theme/palette";
import { useChartColors } from "../../lib/report-colors";

interface RankedBar {
  key: string;
  label: string;
  /** null renders as an em dash — "no cohort to measure", not "0%". */
  value: number | null;
  caption?: string;
}

/**
 * A horizontal bar LIST, not a bar chart, and not SVG.
 *
 * v1 puts one bar per assignment on a vertical axis labelled with the
 * assignment title (R18, reports-view.tsx:55-61). Titles are free text; they do
 * not fit at 375 px. Spec §9: "Use a horizontal bar list with the title as a
 * row label, not an axis."
 */
export function RankedBars({ bars }: { bars: RankedBar[] }) {
  const chart = useChartColors();

  return (
    <View className="flex-col gap-2">
      {bars.map((bar) => (
        <View
          key={bar.key}
          accessible
          accessibilityLabel={
            bar.value === null
              ? `${bar.label}: no students targeted`
              : `${bar.label}: ${bar.value}%${bar.caption ? `, ${bar.caption}` : ""}`
          }
        >
          <View className="flex-row justify-between gap-2">
            <Text className="min-w-0 flex-1">{bar.label}</Text>
            <Text className="shrink-0">{bar.value === null ? "—" : `${bar.value}%`}</Text>
          </View>
          <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: chart.track }}>
            <View
              className="h-1.5"
              style={{ width: `${bar.value ?? 0}%`, backgroundColor: palette["brand-teal"]["600"] }}
            />
          </View>
          {bar.caption ? <Text className="text-xs text-muted-foreground">{bar.caption}</Text> : null}
        </View>
      ))}
    </View>
  );
}
