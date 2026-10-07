import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  markReadResponseSchema,
  notificationListResponseSchema,
  notificationPreferencesResponseSchema,
  unreadCountResponseSchema,
  type NotificationItem,
  type NotificationPreferences,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export type MarkReadInput = { ids: number[] } | { all: true };

/**
 * The inbox, paginated.
 *
 * v1 had no cursor and truncated at 100 rows with an unread count computed
 * over those rows, so past 100 the header was simply wrong (R33, R37, R39).
 * On a phone this is a FlatList and paging is not optional.
 */
export function useNotifications(unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.list(unreadOnly),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (unreadOnly) params.set("unreadOnly", "true");
      if (pageParam !== undefined) params.set("cursor", String(pageParam));
      const res = await apiClient.get(`/api/v1/notifications?${params.toString()}`);
      return notificationListResponseSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * The badge.
 *
 * A count, not a list: v1 fetched eight rows plus a count on every
 * authenticated page render for every role, opened bell or not (R36). Polled
 * slowly and refetched on focus (spec D11) — and deliberately NOT carried on
 * `GET /me`, which the client caches as session identity.
 */
export function useUnreadCount(): UseQueryResult<number> {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/notifications/unread-count");
      return unreadCountResponseSchema.parse(res.data.data).unreadCount;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Marking read is an explicit write, called from a user action — never from a
 * `useEffect` keyed on query data (ruling C6, spec D2).
 *
 * v1 changed read state from exactly one control and never on open (R48, R49).
 * Mobile users expect mark-on-open, which is a new write on a screen React
 * Query refetches on mount, on focus and on reconnect; wiring it to the query
 * resolving would fire it on every one of those. The endpoint is idempotent
 * (its `readAt: null` filter), which is what makes a repeat free rather than a
 * second timestamp.
 */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkReadInput) => {
      const res = await apiClient.post("/api/v1/notifications/read", input);
      return markReadResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
    },
  });
}

export function useNotificationPreferences(): UseQueryResult<NotificationPreferences> {
  return useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/notification-preferences");
      return notificationPreferencesResponseSchema.parse(res.data.data).preferences;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (preferences: NotificationPreferences) => {
      // PUT with all six keys — the contract has no partial form, which is
      // what keeps a client from silently leaving a key at its default.
      const res = await apiClient.put("/api/v1/me/notification-preferences", preferences);
      return notificationPreferencesResponseSchema.parse(res.data.data).preferences;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.notifications.preferences(), preferences);
    },
  });
}

/** Flattened pages, for a FlatList's `data`. */
export function flattenNotifications(
  pages: { items: NotificationItem[] }[] | undefined,
): NotificationItem[] {
  return (pages ?? []).flatMap((p) => p.items);
}
