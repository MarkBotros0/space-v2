import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { NavigationContext } from "expo-router/react-navigation";

/** How long the spinner stays after a pull, however fast the reload answers. */
export const PULL_MIN_MS = 600;

/**
 * Pull-to-refresh state for a RefreshControl. iOS's control spins from the
 * moment of the pull and stops only when `refreshing` goes true and then
 * false; a reload that answers within a frame (or a refetch React Query
 * dedupes) never flips the prop, and the spinner stays forever (owner,
 * 2026-11-07, season screen). So a pull holds `refreshing` true itself for at
 * least PULL_MIN_MS and for as long as the screen says it is still loading.
 *
 * Navigation freezes it too (owner, 2026-11-08): UIRefreshControl ignores
 * `refreshing` going false while its screen is off the window (a push on top,
 * another tab), so back on the screen the spinner hangs. So a blur drops the
 * pull, and each focus hands out a new `key`: the screen remounts its
 * RefreshControl, which starts from the current `refreshing` value.
 *
 * Only a pull shows the spinner (owner, 2026-11-13: a gap at the top after switching tabs that a
 * scroll clears). A background refetch (`refreshing` true with no pull: a tab's data going stale,
 * an invalidation after a save) used to set the control refreshing too; iOS then begins refreshing
 * programmatically, which pushes the content down by the spinner's height with the spinner out of
 * sight, and a refetch that ends while the tab is off the window never gives that space back. So
 * `refreshing` from the screen only holds a pull's spinner until the reload is in; on its own it
 * shows nothing, and the data still updates in place.
 */
export function usePullRefresh(refreshing: boolean, onRefresh: (() => void) | undefined) {
  const [pulled, setPulled] = useState(false);
  const pulledAt = useRef(0);
  const [focusKey, setFocusKey] = useState(0);
  // Null outside a navigator (tests, the catalogue): nothing to listen to there.
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (!navigation) return;
    const offFocus = navigation.addListener("focus", () => setFocusKey((k) => k + 1));
    const offBlur = navigation.addListener("blur", () => setPulled(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

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

  return {
    refreshing: pulled,
    onRefresh: onRefresh ? handle : undefined,
    key: `pull-${focusKey}`,
  };
}
