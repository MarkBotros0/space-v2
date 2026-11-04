/**
 * Whether the floating tab bar should be showing, driven by the scrolling
 * screen under it (ruling R2: created by Task 10 for `Screen`, animated by
 * Task 11's pill). Scrolling down hides it; scrolling up, or reaching the end
 * of the content, shows it again, so the last rows are never trapped under it.
 *
 * `Screen` reports only when the direction or the at-end flag changes (see
 * `scrollDirectionStep`), never every frame, so this store sees a handful of
 * updates per gesture.
 */
import { create } from "zustand";

export type ScrollDirection = "up" | "down";

const useTabBarStore = create<{ visible: boolean }>(() => ({ visible: true }));

function onScrollDirection(dir: ScrollDirection, atEnd: boolean): void {
  const visible = dir === "up" || atEnd;
  if (useTabBarStore.getState().visible !== visible) useTabBarStore.setState({ visible });
}

// One object for every caller: a scroll handler that closes over it never
// needs to be rebuilt.
const REPORTER = { onScrollDirection } as const;

/** The reporter a scrolling screen calls with its direction. */
export function useTabBarScroll(): {
  onScrollDirection(dir: ScrollDirection, atEnd: boolean): void;
} {
  return REPORTER;
}

/** Read side, for the tab bar. */
export function useTabBarVisible(): boolean {
  return useTabBarStore((s) => s.visible);
}

/** Shows the bar again (tests; a tab switch). */
export function resetTabBarScroll(): void {
  useTabBarStore.setState({ visible: true });
}

/**
 * How far the list must move from the anchor, in one direction, before the
 * direction changes: 24px of sustained scroll (Task 11's value), so jitter,
 * a resting finger or a small reversal mid-fling never flips the bar.
 */
export const SCROLL_THRESHOLD = 24;
/** How close to the bottom of the content counts as the end. */
const END_SLOP = 4;

export type ScrollStep = { anchor: number; dir: ScrollDirection | null; atEnd: boolean };

export const INITIAL_SCROLL_STEP: ScrollStep = { anchor: 0, dir: null, atEnd: false };

/**
 * One scroll event folded into the running direction. `anchor` is the offset
 * at which the direction was last confirmed; only a move of more than
 * SCROLL_THRESHOLD away from it counts. At or above the top
 * (bounce, pull-to-refresh) is always "up". A worklet: `Screen` runs it in
 * its UI-thread scroll handler.
 */
export function scrollDirectionStep(
  prev: ScrollStep,
  y: number,
  viewport: number,
  content: number,
): ScrollStep {
  "worklet";
  const atEnd = y + viewport >= content - END_SLOP;
  if (y <= 0) return { anchor: Math.max(y, 0), dir: "up", atEnd };
  const delta = y - prev.anchor;
  if (delta > SCROLL_THRESHOLD) return { anchor: y, dir: "down", atEnd };
  if (delta < -SCROLL_THRESHOLD) return { anchor: y, dir: "up", atEnd };
  return { anchor: prev.anchor, dir: prev.dir, atEnd };
}
