/**
 * Where a percent sits for colour: "ok" from 75, "warn" from 50, "bad" below. The one rule
 * behind a finished season's result bars and the student page's progress rings; each screen maps
 * the band to its own class (a bar's fill, a ring's stroke). Colour is never the only signal:
 * the figure is always written beside it.
 */
type ProgressBand = "ok" | "warn" | "bad";

export function progressBand(pct: number): ProgressBand {
  if (pct >= 75) return "ok";
  if (pct >= 50) return "warn";
  return "bad";
}
