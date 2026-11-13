/** Pure maths for a time scrubber: where a touch lands in seconds, and a step that stays inside the video. */

/** Whole seconds, between 0 and `max`. */
export function clampSeconds(seconds: number, max: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(Math.max(0, Math.round(seconds)), Math.max(0, Math.floor(max)));
}

/** The second under a touch `x` points along a track `width` wide. */
export function secondsAtX(x: number, width: number, max: number): number {
  if (width <= 0) return 0;
  return clampSeconds((x / width) * max, max);
}

/** Where the thumb sits, 0..1. */
export function fractionOf(seconds: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, seconds / max)) : 0;
}
