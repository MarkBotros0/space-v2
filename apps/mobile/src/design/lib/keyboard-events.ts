import { useEffect, useState } from "react";
import { Keyboard, type KeyboardEvent, Platform } from "react-native";

/**
 * Subscribes to the platform's keyboard show/hide events; returns the
 * unsubscribe. iOS announces the keyboard before it moves (`Will`), Android
 * only once it is up (`Did`).
 */
export function subscribeKeyboard(onShow: (e: KeyboardEvent) => void, onHide: () => void): () => void {
  const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
  const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
  const show = Keyboard.addListener(showEvent, onShow);
  const hide = Keyboard.addListener(hideEvent, onHide);
  return () => {
    show.remove();
    hide.remove();
  };
}

/**
 * Just the keyboard's height (0 when closed), for pinned bars that sit above
 * the keyboard rather than inside a scroll view (sheets, save bars).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(
    () =>
      subscribeKeyboard(
        (e) => setHeight(e.endCoordinates.height),
        () => setHeight(0),
      ),
    [],
  );
  return height;
}
