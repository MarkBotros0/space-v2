import { useState } from "react";

import { useIsOnline } from "../lib/online";

/**
 * A pull's spinner, owned by the pull. A query's `isRefetching` is also true for a
 * poll or a background read, which would flash the spinner at a student who did
 * nothing. Offline it stays down: the read is paused and its promise waits for the
 * connection, which would leave the spinner up with nothing happening.
 */
export function usePullRefresh(refresh: () => Promise<unknown>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [pulling, setPulling] = useState(false);
  const online = useIsOnline();
  return {
    refreshing: pulling && online,
    onRefresh: () => {
      setPulling(true);
      void refresh().finally(() => setPulling(false));
    },
  };
}
