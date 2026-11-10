import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { seasonStartCheckSchema, startSeasonResponseSchema, type SeasonStartCheck } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { LIVE_CHECK } from "../lib/query-client";
import { isSeasonCheckKey, queryKeys } from "../lib/query-keys";
import { loadedId } from "../lib/loaded-id";

/** GET /seasons/:id/start-check (SUPER): who stops a draft from starting. */
export function useSeasonStartCheck(id: number | null): UseQueryResult<SeasonStartCheck> {
  return useQuery({
    queryKey: queryKeys.seasons.startCheck(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${id}/start-check`);
      return seasonStartCheckSchema.parse(res.data.data);
    },
    enabled: id !== null,
    ...LIVE_CHECK,
  });
}

/**
 * POST /seasons/:id/start. Starting moves the season's status and everyone's
 * seats (each refreshes into their role; the super's own role does not change),
 * so the roots are invalidated, not one leaf. Not the start-check: it is mounted
 * on the screen that starts the season and would answer not_draft.
 */
export function useStartSeason(id: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/seasons/${loadedId(id)}/start`);
      return startSeasonResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seasons.all,
        predicate: (q) => !isSeasonCheckKey(q.queryKey, "start-check"),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

/** POST /seasons/:id/enrollments/:userId/override (SUPER, draft row). Refreshes the check. */
export function useOverrideEnrollment(seasonId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) => {
      await apiClient.post(`/api/v1/seasons/${loadedId(seasonId)}/enrollments/${userId}/override`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all }),
  });
}
