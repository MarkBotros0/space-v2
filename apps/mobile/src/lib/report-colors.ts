// apps/mobile/src/lib/report-colors.ts
import type { EngagementBand } from "@space/shared";
import { useColorScheme } from "nativewind";

import { palette } from "../design/theme/palette";

/**
 * The one thing from v1's chart-colors.ts that has to survive the React Native
 * swap, and it survives as a MAP rather than as an index.
 *
 * v1's engagement pie was semantic by coincidence: `categoricalPalette` is
 * [success, teal, warning, error] and the bucket Map happened to be seeded
 * High, Medium, Low, At risk (chart-colors.ts:29-35 against
 * reports-query.ts:155-160), so slices were coloured by array position.
 * Reordering the seed would have silently painted "High" red and nothing
 * anywhere declared the mapping (R92, spec D11).
 *
 * The band colours are mid-ramp steps that read on both themes, as v1's do
 * (v1's charts use one palette in light and dark).
 *
 * Note the trap v1 left next door (R96): attendance reads green / red /
 * amber for Present / Absent / Late while the palette's indices 0-2 are green /
 * TEAL / amber, so colouring an attendance chart from the palette by index
 * paints ABSENT teal. Nothing here is coloured by attendance status; anything
 * that later is must build its own explicit map, not reuse this one.
 */
const BAND_COLOR: Record<EngagementBand, string> = {
  HIGH: palette.success["500"],
  MEDIUM: palette["brand-teal"]["600"],
  LOW: palette.warning["500"],
  AT_RISK: palette.error["500"],
};

export function bandColor(band: EngagementBand): string {
  return BAND_COLOR[band];
}

export interface ChartColors {
  /** Unfilled track behind a donut arc or a bar, and the trend line's grid. */
  track: string;
  /** One colour per series, in order; wraps past the end. */
  series: string[];
}

const LIGHT: ChartColors = {
  track: palette.neutral["200"],
  series: [
    palette["brand-teal"]["700"],
    palette["brand-navy"]["600"],
    palette.warning["600"],
    palette.success["600"],
    palette.info["600"],
    palette.error["500"],
  ],
};

// On v1's dark background (#001226) the light series' navy is invisible and
// a neutral-200 track glares; the same hues one step lighter, on navy-800.
const DARK: ChartColors = {
  track: palette["brand-navy"]["800"],
  series: [
    palette["brand-teal"]["400"],
    palette["brand-navy"]["300"],
    palette.warning["400"],
    palette.success["400"],
    palette.info["400"],
    palette.error["400"],
  ],
};

/** Raw colours for the SVG and bar charts, for the active theme. */
export function useChartColors(): ChartColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? DARK : LIGHT;
}
