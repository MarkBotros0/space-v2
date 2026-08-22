import { QueryClient } from "@tanstack/react-query";

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
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
