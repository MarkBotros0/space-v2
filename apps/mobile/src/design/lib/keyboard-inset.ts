import { type RefObject, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Dimensions, type NativeScrollEvent, type NativeSyntheticEvent, Platform, type ScrollViewInstance, TextInput } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { subscribeKeyboard, useKeyboardHeight } from "./keyboard-events";
import { keyboardBottomOffset, keyboardTopInWindow } from "./keyboard-offset";

/**
 * Space kept between the focused field and the top of the keyboard. Generous
 * on purpose: on the CI emulator the keyboard's reported top sat about 45dp
 * below where it is drawn, so a 24dp gap left every focused field half hidden
 * (UI sweep run 40, small phones). The keyboard's top now also comes from
 * `keyboardBottomOffset` (the nav bar added back, final review I2), which
 * should account for most of that miss, but the gap stays at 96 until a
 * 3-button device cell confirms it: extra room only costs scroll range, which
 * the padding (offset + 16) provides.
 */
const FIELD_GAP = 96;
/** Retries after the keyboard opens: the padding below lands a layout pass or two later. */
const RETRY_MS = [0, 150, 400];

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };

/**
 * Keeps the focused field of a scrolling form above the keyboard, on Android
 * too. With edge-to-edge (always on from Expo SDK 54) Android no longer
 * resizes the window for the keyboard, so `adjustResize` does nothing, and
 * KeyboardAvoidingView measures its frame relative to its parent, which is
 * wrong under anything drawn above the scroll view. Instead:
 * - `inset` is the keyboard's height while it is open, as RN reports it;
 *   `offset` is how far the keyboard reaches up from the window's bottom
 *   (`keyboardBottomOffset`: on Android the nav bar under it added back, 0
 *   when closed). The caller adds `offset` to the scroll content's bottom
 *   padding so every field and the submit button below it can be scrolled
 *   above the keyboard;
 * - once the keyboard is open and again when the content has grown by that
 *   padding, the focused input is measured in window coordinates against the
 *   keyboard's top (`keyboardTopInWindow`) and the scroll view moved up by however much
 *   the field overlaps the keyboard. Android scrolls a focused field into view
 *   itself, but the first time it does so before the padding exists, so it
 *   runs out of scroll range short of the keyboard (UI sweep, Oct 2026).
 * Spread `scrollProps` onto the ScrollView. A scroll view whose `onScroll` is
 * taken by something else (a Reanimated handler: `Screen`) passes
 * `getOffset` instead and leaves `scrollProps.onScroll` off.
 */
export function useKeyboardInset(options?: { getOffset?: () => number }): {
  inset: number;
  offset: number;
  scrollProps: {
    ref: RefObject<ScrollViewInstance | null>;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onContentSizeChange: () => void;
    scrollEventThrottle: number;
    keyboardShouldPersistTaps: "handled";
  };
} {
  const ref = useRef<ScrollViewInstance | null>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [inset, setInset] = useState(0);
  const insetBottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const insetBottomRef = useRef(insetBottom);
  insetBottomRef.current = insetBottom;
  const getOffset = useRef(options?.getOffset);
  getOffset.current = options?.getOffset;

  const ensureVisible = useCallback(() => {
    const top = keyboardTop.current;
    if (top === null) return;
    const input = TextInput.State.currentlyFocusedInput() as unknown as Measurable | null;
    input?.measureInWindow?.((_x, y, _w, h) => {
      const overlap = y + h + FIELD_GAP - top;
      const from = getOffset.current ? getOffset.current() : offset.current;
      if (overlap > 1) ref.current?.scrollTo({ y: from + overlap, animated: false });
    });
  }, []);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const unsubscribe = subscribeKeyboard(
      (e) => {
        const { height, screenY } = e.endCoordinates;
        keyboardTop.current = keyboardTopInWindow({
          screenY,
          windowHeight: Dimensions.get("window").height,
          offset: keyboardBottomOffset({ os: Platform.OS, keyboard: height, insetBottom: insetBottomRef.current }),
        });
        setInset(height);
        timers.forEach(clearTimeout);
        timers = RETRY_MS.map((ms) => setTimeout(ensureVisible, ms));
      },
      () => {
        keyboardTop.current = null;
        setInset(0);
      },
    );
    return () => {
      timers.forEach(clearTimeout);
      unsubscribe();
    };
  }, [ensureVisible]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  return {
    inset,
    offset: keyboardBottomOffset({ os: Platform.OS, keyboard: inset, insetBottom, closed: 0 }),
    scrollProps: {
      ref,
      onScroll,
      onContentSizeChange: ensureVisible,
      scrollEventThrottle: 16,
      keyboardShouldPersistTaps: "handled",
    },
  };
}

export { useKeyboardHeight };
