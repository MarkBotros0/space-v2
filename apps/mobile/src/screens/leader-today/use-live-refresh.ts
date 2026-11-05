import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/** How often Today re-reads while a session is on the day or running. */
export const LIVE_TODAY_REFRESH_MS = 30_000;

/**
 * Keeps the leader's Today honest while it is the screen in front. Tabs stay
 * mounted when left, so nothing else re-reads it: a student checking in on
 * their own phone would never move "not checked in". While focused it
 * refetches when stale on focus, whenever the app returns to the foreground,
 * and, only when the session is on the day or in progress, every 30 seconds.
 * Unfocused, it does nothing. Local to this screen on purpose: other roles'
 * Today keep their cache behaviour.
 */
export function useLiveTodayRefresh({
  refetch,
  isStale,
  live,
}: {
  refetch: () => unknown;
  isStale: boolean;
  /** The session is on its day or in progress: poll. */
  live: boolean;
}) {
  // The latest values, read when an event fires, so a re-render never re-runs
  // the focus effect (and so never refetches by itself).
  const latest = useRef({ refetch, isStale });
  useEffect(() => {
    latest.current = { refetch, isStale };
  });

  useFocusEffect(
    useCallback(() => {
      if (latest.current.isStale) void latest.current.refetch();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void latest.current.refetch();
      });
      const timer = live ? setInterval(() => void latest.current.refetch(), LIVE_TODAY_REFRESH_MS) : null;
      return () => {
        sub.remove();
        if (timer) clearInterval(timer);
      };
    }, [live]),
  );
}
