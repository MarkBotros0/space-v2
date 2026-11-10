/**
 * How the launch screen hands over to the app (owner, 2026-11-10): once the
 * logo is written, the letters fade and the logo's two dots move to the
 * centre, where they circle each other as the loader for as long as boot
 * takes (at least half a turn). When the app is ready, the circle they trace
 * widens into a window onto it: the dots ride its edge, slowing as it opens,
 * and leave the screen. Plain timings and ease-out, no overshoot (motion.md).
 *
 * Pure: the numbers and worklets the launch screen animates with, so the
 * geometry is tested apart from the animation.
 */
import { LOGO_DOT_RADIUS, LOGO_DOTS } from "./logo-strokes";

/** The logo's viewBox origin and side, from LOGO_VIEWBOX. */
const VIEW_MIN = 140;
const VIEW_SIZE = 744;

export const LAUNCH_LOGO_SIZE = 168;

export const LAUNCH = {
  /** A beat on the finished logo before anything moves. */
  holdMs: 200,
  /** The J, P and C fade while the dots set off. */
  lettersOutMs: 180,
  /** The dots move from the logo to the loader's circle. */
  gatherMs: 380,
  /** One turn of the loader. */
  spinPeriodMs: 1000,
  /** Even when boot is already done, the loader shows for half a turn. */
  minSpinMs: 500,
  /** The circle opens onto the app. */
  openMs: 750,
  /** The loader's circle: each dot this far from the centre. */
  orbitRadius: 16,
} as const;

/** The timers the launch steps through after the writing, in order (for tests). */
export const LAUNCH_STEPS_MS = [LAUNCH.holdMs, LAUNCH.gatherMs, LAUNCH.minSpinMs, LAUNCH.openMs] as const;

export type Point = { x: number; y: number };

/** The dot radius on screen, at the launch logo's size. */
export const LAUNCH_DOT_RADIUS = (LOGO_DOT_RADIUS * LAUNCH_LOGO_SIZE) / VIEW_SIZE;

/** Where the logo's two dots sit on a screen of this size (the logo is centred). */
export function logoDotsOnScreen(width: number, height: number): [Point, Point] {
  const scale = LAUNCH_LOGO_SIZE / VIEW_SIZE;
  const left = (width - LAUNCH_LOGO_SIZE) / 2;
  const top = (height - LAUNCH_LOGO_SIZE) / 2;
  const at = (d: { cx: number; cy: number }): Point => ({
    x: left + (d.cx - VIEW_MIN) * scale,
    y: top + (d.cy - VIEW_MIN) * scale,
  });
  return [at(LOGO_DOTS[0]), at(LOGO_DOTS[1])];
}

/**
 * How far the loader's circle grows, so the hole inside it (orbit minus
 * orbitRadius) clears every corner of the screen.
 */
export function openRadius(width: number, height: number): number {
  return Math.hypot(width / 2, height / 2) + LAUNCH.orbitRadius + LAUNCH_DOT_RADIUS + 2;
}

/**
 * Where dot `index` (0 = top, 1 = bottom) is. `gather` 0..1 takes it from the
 * logo to the loader's circle (top dot at 12 o'clock, bottom at 6); after
 * that, `angle` turns the pair round the centre and `open` 0..1 widens the
 * circle. The two meet exactly at gather = 1, angle = 0, open = 0.
 */
export function dotPosition(
  index: 0 | 1,
  from: Point,
  centre: Point,
  far: number,
  gather: number,
  angle: number,
  open: number,
): Point {
  "worklet";
  const side = index === 0 ? -1 : 1;
  if (gather < 1) {
    return {
      x: from.x + (centre.x - from.x) * gather,
      y: from.y + (centre.y + side * LAUNCH.orbitRadius - from.y) * gather,
    };
  }
  const radius = LAUNCH.orbitRadius + (far - LAUNCH.orbitRadius) * open;
  const a = -Math.PI / 2 + angle + index * Math.PI;
  return { x: centre.x + radius * Math.cos(a), y: centre.y + radius * Math.sin(a) };
}

/** How much the angle still turns while the circle opens: the loader's speed at first, easing to a stop. */
export function openingTurn(): number {
  "worklet";
  // EASE_OUT (cubic) starts at three times its average speed, so a third of
  // speed × duration keeps the turn seamless as the opening begins.
  return (((2 * Math.PI) / LAUNCH.spinPeriodMs) * LAUNCH.openMs) / 3;
}

/**
 * The launch background as one path: the whole screen, with a circular hole
 * of `hole` at the centre once the opening starts (even-odd fill).
 */
export function backgroundPath(width: number, height: number, centre: Point, hole: number): string {
  "worklet";
  const rect = `M0 0H${width}V${height}H0Z`;
  if (hole <= 0) return rect;
  const { x, y } = centre;
  return `${rect}M${x - hole} ${y}a${hole} ${hole} 0 1 0 ${2 * hole} 0a${hole} ${hole} 0 1 0 ${-2 * hole} 0Z`;
}
