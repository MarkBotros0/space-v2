import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKeyboardHeight } from "./keyboard-events";

type OffsetInput = {
  os: string;
  /** Keyboard height from RN's keyboard events (0 when closed). */
  keyboard: number;
  /** Bottom safe-area inset (home indicator / navigation bar). */
  insetBottom: number;
  /** Offset while the keyboard is closed; defaults to `insetBottom`. */
  closed?: number;
  /** True when the OS shrank the window to end at the keyboard's top. */
  windowResized?: boolean;
};

/**
 * Distance from the bottom of a full-screen window to where a pinned bar
 * must sit so it rides on the keyboard.
 * - iOS: the keyboard frame runs to the screen's bottom edge and so already
 *   covers the home-indicator inset; its height replaces the inset.
 * - Android: RN reports `ime.bottom - systemBars.bottom` (ReactRootView
 *   `checkForKeyboardEvents`), i.e. the keyboard WITHOUT the navigation bar
 *   it sits above. The app is edge-to-edge (and RN makes every Modal dialog
 *   edge-to-edge too, `ReactModalHostView` -> `enableEdgeToEdge`), so the
 *   window is never resized and the nav-bar inset must be added back, or the
 *   bar ends up that far under the keyboard (UI sweep s90-12: hidden with
 *   3-button nav, only its top edge showing with gesture nav).
 * - A window the OS did resize already ends at the keyboard: no lift.
 */
export function keyboardBottomOffset({ os, keyboard, insetBottom, closed, windowResized = false }: OffsetInput): number {
  if (keyboard <= 0) return closed ?? insetBottom;
  if (os === "android") return windowResized ? 0 : keyboard + insetBottom;
  return keyboard;
}

/** `keyboardBottomOffset` for the running platform, from the live keyboard and insets. */
export function useKeyboardBottomOffset(closed?: number): number {
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  return keyboardBottomOffset({ os: Platform.OS, keyboard, insetBottom: insets.bottom, closed });
}

/**
 * The keyboard's top edge in window coordinates (the space `measureInWindow`
 * reports a field in), for scrolling the focused field above it. RN's
 * `screenY` is one answer; the window's height less `keyboardBottomOffset`
 * (which adds back the Android nav bar RN leaves out of the height) is the
 * other. They agree when RN measures right; when they don't, the higher edge
 * wins, so a field is never left behind the part of the keyboard one of them
 * missed (final review I2).
 */
export function keyboardTopInWindow({
  screenY,
  windowHeight,
  offset,
}: {
  screenY: number;
  windowHeight: number;
  /** `keyboardBottomOffset` for the open keyboard. */
  offset: number;
}): number {
  return Math.min(screenY, windowHeight - offset);
}
