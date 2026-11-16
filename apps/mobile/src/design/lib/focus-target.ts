/**
 * A focused field that is not a native TextInput: the rich-text editor is a WebView, so
 * `TextInput.State.currentlyFocusedInput()` never sees it and the keyboard inset left the
 * announcement's Message editor wholly under the pinned Post bar on a 360×640 phone (whole-app
 * sweep 2026-11-16, F5). Such a field registers its outer view here while it has focus.
 */
type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };

let current: Measurable | null = null;
const listeners = new Set<() => void>();

/** Sets (or, with null, clears) the focused non-TextInput field; listeners rerun their scroll. */
export function setFocusTarget(target: Measurable | null): void {
  current = target;
  if (target) listeners.forEach((l) => l());
}

/** Clears the target only if it is still `target` (a second editor may have taken focus). */
export function clearFocusTarget(target: Measurable | null): void {
  if (current === target) current = null;
}

export function focusTarget(): Measurable | null {
  return current;
}

/** Called when a field registers focus, so a keyboard already open still scrolls it into view. */
export function subscribeFocusTarget(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
