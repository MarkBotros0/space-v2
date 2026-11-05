import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { AppState } from "react-native";

/**
 * Runs `refresh` when the screen gains focus and when the app comes back to the
 * foreground while it has focus. React Query's own focus refetch is off on
 * mobile (query-client.ts), and a tab screen stays mounted when left.
 */
export function useRefreshOnResume(refresh: () => void): void {
  const latest = useRef(refresh);
  latest.current = refresh;

  useFocusEffect(
    useCallback(() => {
      latest.current();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") latest.current();
      });
      return () => sub.remove();
    }, []),
  );
}
