import { useCallback, useEffect, useRef, useState } from "react";

/** How long the spinner stays after a pull, however fast the reload answers. */
export const PULL_MIN_MS = 600;

/**
 * Pull-to-refresh state for a RefreshControl. iOS's control spins from the
 * moment of the pull and stops only when `refreshing` goes true and then
 * false; a reload that answers within a frame (or a refetch React Query
 * dedupes) never flips the prop, and the spinner stays forever (owner,
 * 2026-11-07, season screen). So a pull holds `refreshing` true itself for at
 * least PULL_MIN_MS and for as long as the screen says it is still loading.
 */
export function usePullRefresh(refreshing: boolean, onRefresh: (() => void) | undefined) {
  const [pulled, setPulled] = useState(false);
  const pulledAt = useRef(0);

  const handle = useCallback(() => {
    pulledAt.current = Date.now();
    setPulled(true);
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    if (!pulled || refreshing) return;
    const wait = Math.max(0, PULL_MIN_MS - (Date.now() - pulledAt.current));
    const timer = setTimeout(() => setPulled(false), wait);
    return () => clearTimeout(timer);
  }, [pulled, refreshing]);

  return { refreshing: pulled || refreshing, onRefresh: onRefresh ? handle : undefined };
}
