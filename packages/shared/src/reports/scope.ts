import { z } from "zod";

// ---------------------------------------------------------------------------
// Request scope
// ---------------------------------------------------------------------------

/**
 * Express hands a repeated query parameter as `string[]` and a single one as
 * `string`, so both shapes normalise to an array before coercion.
 *
 * An EMPTY array means "my whole permitted scope", resolved server-side — not
 * v1's "every season in the database" (R1), which was only safe because the
 * caller was a server component that had already checked.
 */
const seasonIdsParam = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.coerce.number().int().positive()).max(50),
);

export const reportScopeQuerySchema = z.object({
  seasonId: seasonIdsParam.default([]),
  /**
   * v1 declared `from`/`to` and no caller ever passed them (R5). They narrow
   * the attendance-trend session window and nothing else (R4) — implemented
   * here rather than deleted, because a date window is exactly what a phone
   * needs (spec D9, §9).
   */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Most-recent-N sessions inside the window. 26 ≈ one point per week for a two-term season. */
  trendLimit: z.coerce.number().int().min(1).max(200).default(26),
});
