import { z } from "zod";
import { isAtRisk, type EngagementScore } from "../note";

// ---------------------------------------------------------------------------
// Engagement bands
// ---------------------------------------------------------------------------

/**
 * The four bands of v1's AT_RISK_BUCKETS (reports-query.ts:47-59), as enum
 * members rather than the display strings v1 used as Map keys.
 *
 * v1's pie was semantic BY COINCIDENCE: `categoricalPalette`'s array order
 * (green, teal, amber, red) happened to line up with the Map seed order, so
 * reordering the seed would have silently painted "High" red (R92). An enum
 * lets the colour map be declared instead of inferred from array position —
 * see apps/mobile/src/lib/report-colors.ts.
 */
export const engagementBandSchema = z.enum(["HIGH", "MEDIUM", "LOW", "AT_RISK"]);
export type EngagementBand = z.infer<typeof engagementBandSchema>;

/** Seed order for the band counts — every band is emitted, including zeroes (R31). */
export const BAND_ORDER = ["HIGH", "MEDIUM", "LOW", "AT_RISK"] as const satisfies readonly EngagementBand[];

export const BAND_LABEL: Record<EngagementBand, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  AT_RISK: "At risk",
};

/**
 * The ONE banding function, and the reason the at-risk list cannot disagree
 * with the at-risk band.
 *
 * v1 had three thresholds on one screen: bands cut the composite at 80/60/40
 * (R30) while the at-risk list took `score < 60` (R33), and the mentor
 * dashboard tested each component against 60 (domain 9 R73). A student at
 * 55 attendance / 95 submissions was "Medium" here and at-risk there.
 *
 * AT_RISK is evaluated FIRST and delegates entirely to domain 9's `isAtRisk`,
 * so band membership is that predicate by construction (ruling C4, spec D5).
 * The remaining three bands are a presentational split of the composite.
 *
 * A student with both denominators zero — a season that has not started —
 * scores 0, is not at risk (Plan 12's guard, fixing R56), and bands LOW. "Low"
 * is a weak label for "no data yet"; the Key sheet and the screen's method
 * note say so, and a fifth band would change the pie's category count.
 */
export function bandFor(score: EngagementScore): EngagementBand {
  if (isAtRisk(score)) return "AT_RISK";
  if (score.score >= 80) return "HIGH";
  if (score.score >= 60) return "MEDIUM";
  return "LOW";
}
