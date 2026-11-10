/**
 * The JPC logo as pen strokes, traced from assets/icon.png (1024 x 1024; the
 * centre lines of its 58-unit round-capped strokes match the artwork to 98%
 * by area). Two strokes and two dots:
 *   - J and P in one stroke: down into the J's bowl, up, across, round the
 *     P's loop and down its stem;
 *   - the C: over the top, down, round the bottom;
 *   - the two dots, each a pen tap.
 * The C writes together with the J and P, then both dots tap in together
 * (owner, 2026-11-10).
 * Lengths are exact (straight runs plus arcs), so a dash of that length
 * draws the stroke from nothing to whole.
 */

export const LOGO_STROKE_WIDTH = 58;
export const LOGO_DOT_RADIUS = LOGO_STROKE_WIDTH / 2;

/** The square around the mark (artwork 150..873 on both axes, plus a margin). */
export const LOGO_VIEWBOX = "140 140 744 744";

const PI = Math.PI;

export const LOGO_STROKES = [
  {
    key: "jp",
    d:
      "M179.5 705 L179.5 733 A110.5 110.5 0 0 0 400.5 733 L400.5 510.5 " +
      "A110 110 0 0 1 510.5 400.5 L733 400.5 A110.5 110.5 0 1 0 622.5 290 L622.5 622",
    length: 28 + PI * 110.5 + 222.5 + (PI / 2) * 110 + 222.5 + 1.5 * PI * 110.5 + 332,
  },
  {
    key: "c",
    d: "M733 622 A110.5 110.5 0 0 0 512 622 L512 733 A110.5 110.5 0 0 0 733 733",
    length: PI * 110.5 + 111 + PI * 110.5,
  },
] as const;

export const LOGO_DOTS = [
  { key: "dot-top", cx: 179.5, cy: 558.5 },
  { key: "dot-bottom", cx: 179.5, cy: 628.5 },
] as const;

/**
 * When each mark is drawn, in ms from the start (owner, 2026-11-10: the C
 * with the J and P, both dots at once; 1.85 s in all). A short lift between
 * the strokes and the dots.
 */
export const LOGO_TIMELINE = {
  jp: [0, 1550],
  c: [0, 1550],
  "dot-top": [1730, 1850],
  "dot-bottom": [1730, 1850],
} as const satisfies Record<string, readonly [number, number]>;

export const LOGO_WRITING_MS = 1850;

/**
 * How far a mark drawn over [start, end] is at `t` ms: 0 before, 1 after,
 * smoothstep between (the pen eases in and out of each stroke).
 */
export function markProgress(t: number, start: number, end: number): number {
  "worklet";
  if (t <= start) return 0;
  if (t >= end) return 1;
  const x = (t - start) / (end - start);
  return x * x * (3 - 2 * x);
}
