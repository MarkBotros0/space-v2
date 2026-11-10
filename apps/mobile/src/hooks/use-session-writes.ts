import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  sessionCreatedResponseSchema,
  sessionDeletedResponseSchema,
  sessionSeriesResponseSchema,
  sessionUpdatedResponseSchema,
  type CreateSessionInput,
  type RecurrenceScope,
  type SessionSeries,
  type UpdateSessionInput,
} from "@space/shared";

import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

/**
 * A series write touches N sessions across any number of cached lists and
 * the season detail's counts — invalidate the roots, never a leaf (spec 03 §8).
 */
function useInvalidateSessionData() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
  };
}

export function useCreateSession() {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (body: CreateSessionInput) => apiSend("post", "/api/v1/sessions", body, sessionCreatedResponseSchema),
    onSuccess: invalidate,
  });
}

export function useUpdateSession(id: number) {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (body: UpdateSessionInput) =>
      apiSend("patch", `/api/v1/sessions/${id}`, body, sessionUpdatedResponseSchema),
    onSuccess: invalidate,
  });
}

export function useDeleteSession(id: number) {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (body: { scope: RecurrenceScope; force: boolean }) => {
      // Plan 3's DELETE reads a JSON body; axios sends one on DELETE only via `data`.
      return apiSend("delete", `/api/v1/sessions/${id}`, body, sessionDeletedResponseSchema);
    },
    onSuccess: invalidate,
  });
}

/** The scope preview (D-16.8). Pass enabled=false for scope "one" — nothing to preview. */
export function useSessionSeries(id: number, scope: RecurrenceScope, enabled: boolean): UseQueryResult<SessionSeries> {
  return useQuery({
    queryKey: queryKeys.sessions.series(id, scope),
    queryFn: async () => {
      return apiGet(`/api/v1/sessions/${id}/series`, sessionSeriesResponseSchema, { params: { scope } });
    },
    enabled,
  });
}
