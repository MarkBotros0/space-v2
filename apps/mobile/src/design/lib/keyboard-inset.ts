import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, type KeyboardEvent, type NativeScrollEvent, type NativeSyntheticEvent, Platform, type ScrollViewInstance, TextInput } from "react-native";

/**
 * Space kept between the focused field and the top of the keyboard. Generous
 * on purpose: on the CI emulator the keyboard's reported top sat about 45dp
 * below where it is drawn, so a 24dp gap left every focused field half hidden
 * (UI sweep run 40, small phones). The scroll range allows it, so extra room
 * costs nothing.
 */
const FIELD_GAP = 96;
/** Retries after the keyboard opens: the padding below lands a layout pass or two later. */
const RETRY_MS = [0, 150, 400];

/** Subscribes to the platform's keyboard show/hide events; returns the unsubscribe. */
function subscribeKeyboard(onShow: (e: KeyboardEvent) => void, onHide: () => void): () => void {
  const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
  const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
  const show = Keyboard.addListener(showEvent, onShow);
  const hide = Keyboard.addListener(hideEvent, onHide);
  return () => {
    show.remove();
    hide.remove();
  };
}

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };

/**
 * Keeps the focused field of a scrolling form above the keyboard, on Android
 * too. With edge-to-edge (always on from Expo SDK 54) Android no longer
 * resizes the window for the keyboard, so `adjustResize` does nothing, and
 * KeyboardAvoidingView measures its frame relative to its parent, which is
 * wrong under anything drawn above the scroll view. Instead:
 * - `inset` is the keyboard's height while it is open; the caller adds it to
 *   the scroll content's bottom padding so every field and the submit button
 *   below it can be scrolled above the keyboard;
 * - once the keyboard is open and again when the content has grown by that
 *   padding, the focused input is measured in window coordinates (the space
 *   of the keyboard's `screenY`) and the scroll view moved up by however much
 *   the field overlaps the keyboard. Android scrolls a focused field into view
 *   itself, but the first time it does so before the padding exists, so it
 *   runs out of scroll range short of the keyboard (UI sweep, Oct 2026).
 * Spread `scrollProps` onto the ScrollView. A scroll view whose `onScroll` is
 * taken by something else (a Reanimated handler: `Screen`) passes
 * `getOffset` instead and leaves `scrollProps.onScroll` off.
 */
export function useKeyboardInset(options?: { getOffset?: () => number }): {
  inset: number;
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
        keyboardTop.current = e.endCoordinates.screenY;
        setInset(e.endCoordinates.height);
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
    scrollProps: {
      ref,
      onScroll,
      onContentSizeChange: ensureVisible,
      scrollEventThrottle: 16,
      keyboardShouldPersistTaps: "handled",
    },
  };
}

/**
 * Just the keyboard's height (0 when closed), for pinned bars that sit above
 * the keyboard rather than inside a scroll view (sheets, save bars).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => subscribeKeyboard((e) => setHeight(e.endCoordinates.height), () => setHeight(0)), []);
  return height;
}
