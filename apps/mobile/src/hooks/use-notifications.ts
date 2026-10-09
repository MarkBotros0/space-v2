import {
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
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

export type MarkReadInput = { all: true };

/**
 * The inbox: v1's one list of the newest 100 (notifications-page.tsx:14-27;
 * R33, R39). No cursor, no unread filter. The unread count is a real count
 * from the server, not a filter over the 100 rows.
 */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/notifications");
      return notificationListResponseSchema.parse(res.data.data);
    },
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
 * v1 changed read state from exactly one control — "Mark all read" — and
 * never on open (R47, R48, R49); v2 does the same.
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
    mutationFn: async (preferences: NotificationPreferencesUpdate) => {
      // PUT with v1's five keys (settings-actions.ts:58-73) — quizGraded is
      // not settable in v1 and is never sent.
      const res = await apiClient.put("/api/v1/me/notification-preferences", preferences);
      return notificationPreferencesResponseSchema.parse(res.data.data).preferences;
    },
    // Optimistic (v1 settings-form.tsx togglePref; REG-80): flip now, restore the
    // snapshot if the save fails, then re-read so a raced toggle can't stay wrong.
    onMutate: async (next) => {
      const key = queryKeys.notifications.preferences();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      // The cache holds all six stored keys; keep quizGraded as it was.
      if (previous) queryClient.setQueryData<NotificationPreferences>(key, { ...previous, ...next });
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.preferences(), context.previous);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences() });
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(queryKeys.notifications.preferences(), preferences);
    },
  });
}
