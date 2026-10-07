// apps/mobile/src/lib/report-colors.ts
import type { EngagementBand } from "@space/shared";

import type { Theme } from "../theme";

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
 * Colours come from the theme, not from baked hexes: v1's only theme-aware
 * chart surface is the tooltip (R95) and on a phone dark mode is the norm.
 *
 * Note the trap v1 left next door (R96): AttendancePill reads green / red /
 * amber for Present / Absent / Late while the palette's indices 0-2 are green /
 * TEAL / amber, so colouring an attendance chart from the palette by index
 * paints ABSENT teal. Nothing here is coloured by attendance status; anything
 * that later is must build its own explicit map, not reuse this one.
 */
export function bandColor(theme: Theme, band: EngagementBand): string {
  const map: Record<EngagementBand, string> = {
    HIGH: theme.colors.success[500],
    MEDIUM: theme.colors.brand.teal[600],
    LOW: theme.colors.warning[500],
    AT_RISK: theme.colors.error[500],
  };
  return map[band];
}
