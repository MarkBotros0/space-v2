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

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

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
    mutationFn: async (body: CreateSessionInput) => {
      const res = await apiClient.post("/api/v1/sessions", body);
      return sessionCreatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSession(id: number) {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    mutationFn: async (body: UpdateSessionInput) => {
      const res = await apiClient.patch(`/api/v1/sessions/${id}`, body);
      return sessionUpdatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSession(id: number) {
  const invalidate = useInvalidateSessionData();
  return useMutation({
    mutationFn: async (body: { scope: RecurrenceScope; force: boolean }) => {
      // Plan 3's DELETE reads a JSON body; axios sends one on DELETE only via `data`.
      const res = await apiClient.delete(`/api/v1/sessions/${id}`, { data: body });
      return sessionDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

/** The scope preview (D-16.8). Pass enabled=false for scope "one" — nothing to preview. */
export function useSessionSeries(
  id: number,
  scope: RecurrenceScope,
  enabled: boolean,
): UseQueryResult<SessionSeries> {
  return useQuery({
    queryKey: queryKeys.sessions.series(id, scope),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${id}/series`, { params: { scope } });
      return sessionSeriesResponseSchema.parse(res.data.data);
    },
    enabled,
  });
}
