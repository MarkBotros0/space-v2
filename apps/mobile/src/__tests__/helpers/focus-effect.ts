/**
 * A stand-in for expo-router's useFocusEffect whose focus a test can move:
 *   jest.mock("expo-router", () => ({
 *     useFocusEffect: (e: never) => require("./helpers/focus-effect").useMockFocusEffect(e),
 *   }));
 */
import { useEffect, useSyncExternalStore } from "react";
import { act } from "@testing-library/react-native";

let focused = true;
const listeners = new Set<() => void>();

export function useMockFocusEffect(effect: () => void | (() => void)): void {
  const isFocused = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => focused,
  );
  useEffect(() => (isFocused ? effect() : undefined), [effect, isFocused]);
}

export function setFocused(next: boolean): void {
  act(() => {
    focused = next;
    for (const listener of listeners) listener();
  });
}

export function resetFocus(): void {
  focused = true;
}
