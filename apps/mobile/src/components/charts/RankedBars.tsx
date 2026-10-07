// apps/mobile/src/components/charts/RankedBars.tsx
import { View } from "react-native";

import { useTheme } from "../../theme";
import { Text } from "../../ui";

export interface RankedBar {
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
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
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
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="body">{bar.label}</Text>
            <Text variant="body">{bar.value === null ? "—" : `${bar.value}%`}</Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.colors.neutral[200],
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${bar.value ?? 0}%`,
                height: 6,
                backgroundColor: theme.colors.brand.teal[600],
              }}
            />
          </View>
          {bar.caption ? (
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {bar.caption}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
