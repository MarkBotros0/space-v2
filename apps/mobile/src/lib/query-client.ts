import { MutationCache, QueryClient } from "@tanstack/react-query";

import { useSessionStore } from "../store/session";
import { queryKeys } from "./query-keys";

/**
 * The one place React Query defaults are set — every screen's `useQuery`
 * inherits these rather than repeating them.
 *
 * - `retry: 1` — one retry on failure, not React Query's default 3. Mobile
 *   networks fail often enough that 3 retries (with backoff) makes a broken
 *   request feel hung.
 * - `staleTime: 30_000` — data is treated as fresh for 30s, so navigating
 *   back to a screen doesn't always trigger a refetch.
 * - `refetchOnWindowFocus: false` — "window focus" is a browser tab concept;
 *   it's meaningless on a mobile app and would otherwise do nothing useful
 *   while still being dead config to reason about.
 * - a `MutationCache` that invalidates the dashboard queries after any
 *   successful mutation tagged `DASHBOARD_META` (spec 19 D24).
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // Spec 19 D24: a mutation tagged DASHBOARD_META refreshes every role's
    // Home. Keyed on meta, not on mutation keys, so the tag is visible at the
    // hook that writes and greppable (Task 8's guard test reads it).
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.invalidatesDashboard === true) {
          void client.invalidateQueries({ queryKey: queryKeys.dashboard.all });
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
}

/**
 * Drops every cached query when the signed-in user changes — sign-out
 * (explicit, forced by a dead refresh token, or logout-all) or a different
 * user signing in. Query keys are not scoped by user (`notifications.lists()`,
 * `dashboard.me(seasonId)`), so without this the next person on the same
 * phone briefly sees the previous user's data. Returns the unsubscribe.
 */
export function clearCacheOnUserChange(client: QueryClient): () => void {
  let userId = useSessionStore.getState().user?.id ?? null;
  return useSessionStore.subscribe((state) => {
    const next = state.user?.id ?? null;
    if (next === userId) return;
    if (userId !== null) client.clear();
    userId = next;
  });
}
