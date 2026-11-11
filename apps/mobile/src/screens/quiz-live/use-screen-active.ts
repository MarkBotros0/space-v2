import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

/**
 * True while this screen is the one in front and the app is in the foreground: the live screen
 * polls only then. Blurred (another screen pushed on top, or Back) or backgrounded, it is false.
 */
export function useScreenActive(): boolean {
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(AppState.currentState !== "background" && AppState.currentState !== "inactive");
      const sub = AppState.addEventListener("change", (state) => setActive(state === "active"));
      return () => {
        sub.remove();
        setActive(false);
      };
    }, []),
  );
  return active;
}
