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
 * Unfocused or in the background, it does nothing, and with no season to read
 * (`enabled` false) it never fires: `refetch` ignores a query's `enabled`. Local to this screen on purpose: other roles'
 * Today keep their cache behaviour.
 */
export function useLiveTodayRefresh({
  enabled,
  refetch,
  isStale,
  live,
}: {
  /** There is a season to read. */
  enabled: boolean;
  refetch: () => unknown;
  isStale: boolean;
  /** The session is on its day or in progress: poll. */
  live: boolean;
}) {
  // The latest values, read when an event fires, so a re-render never re-runs
  // the focus effect (and so never refetches by itself).
  const latest = useRef({ enabled, refetch, isStale });
  useEffect(() => {
    latest.current = { enabled, refetch, isStale };
  });

  useFocusEffect(
    useCallback(() => {
      const read = () => {
        if (latest.current.enabled) void latest.current.refetch();
      };
      if (latest.current.isStale) read();
      let foreground = true;
      const sub = AppState.addEventListener("change", (state) => {
        foreground = state === "active";
        if (foreground) read();
      });
      const timer = live
        ? setInterval(() => {
            if (foreground) read();
          }, LIVE_TODAY_REFRESH_MS)
        : null;
      return () => {
        sub.remove();
        if (timer) clearInterval(timer);
      };
    }, [live]),
  );
}
