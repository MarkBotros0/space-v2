/**
 * Taps never fire from a sideways swipe (owner 2026-11-14: a row opened when the
 * finger swiped across it to change tab). The tabs layout's pan reports when a
 * swipe starts and ends; while one runs, and for a short grace after it (the
 * row's release can arrive just after the pan finishes), `swipeBlocksTap()` is
 * true and the kit's Pressable drops the press. The pan never cancels a React
 * Native responder by itself, so the row would otherwise see an ordinary tap.
 */

/** How long after a swipe ends a release is still the swipe's. */
export const SWIPE_TAP_GRACE_MS = 300;

let swiping = false;
let until = 0;

export function swipeStarted(): void {
  swiping = true;
}

export function swipeEnded(now: number = Date.now()): void {
  swiping = false;
  until = now + SWIPE_TAP_GRACE_MS;
}

export function swipeBlocksTap(now: number = Date.now()): boolean {
  return swiping || now < until;
}
