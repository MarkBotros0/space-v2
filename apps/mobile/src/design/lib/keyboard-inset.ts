import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, Platform, type ScrollView, TextInput } from "react-native";

/** Space kept between the focused field and the top of the keyboard. */
const FIELD_GAP = 24;

/**
 * Keeps the focused field of a scrolling form above the keyboard, on Android
 * too. With edge-to-edge (always on from Expo SDK 54) Android no longer
 * resizes the window for the keyboard, so `adjustResize` does nothing, and
 * KeyboardAvoidingView measures its frame relative to its parent, which is
 * wrong under the shell's top bar. Instead:
 * - `inset` is the keyboard's height while it is open; the caller adds it to
 *   the scroll content's bottom padding so every field and the submit button
 *   below it can be scrolled above the keyboard;
 * - when the keyboard opens, the focused input is measured in window
 *   coordinates (the same space as the keyboard's `screenY`) and the scroll
 *   view is moved up by however much the field overlaps the keyboard.
 * Spread `scrollProps` onto the ScrollView.
 */
export function useKeyboardInset(): {
  inset: number;
  scrollProps: {
    ref: RefObject<ScrollView | null>;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
    keyboardShouldPersistTaps: "handled";
  };
} {
  const ref = useRef<ScrollView | null>(null);
  const offset = useRef(0);
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = Keyboard.addListener(showEvent, (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      setInset(e.endCoordinates.height);
      // Wait for the added padding to lay out, or scrollTo is clamped to the
      // old content height.
      clearTimeout(timer);
      timer = setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput() as unknown as {
          measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
        } | null;
        input?.measureInWindow?.((_x, y, _w, h) => {
          const overlap = y + h + FIELD_GAP - keyboardTop;
          if (overlap > 0) ref.current?.scrollTo({ y: offset.current + overlap, animated: true });
        });
      }, 50);
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      clearTimeout(timer);
      show.remove();
      hide.remove();
    };
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  return { inset, scrollProps: { ref, onScroll, scrollEventThrottle: 16, keyboardShouldPersistTaps: "handled" } };
}
