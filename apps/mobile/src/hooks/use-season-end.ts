import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  endSeasonResponseSchema,
  overdueSeasonsResponseSchema,
  seasonEndCheckSchema,
  seasonResultsResponseSchema,
  type EndSeasonRequest,
  type OverdueSeasonsResponse,
  type SeasonEndCheck,
  type SeasonResultsResponse,
  type UpdateSeasonResultRequest,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { LIVE_CHECK } from "../lib/query-client";
import { isSeasonCheckKey, queryKeys } from "../lib/query-keys";
import { loadedId } from "../lib/loaded-id";
import { apiGet, apiSend } from "../lib/api-request";

/** GET /seasons/:id/end-check: what blocks the end, and the students it would end for. */
export function useSeasonEndCheck(id: number | null): UseQueryResult<SeasonEndCheck> {
  return useQuery({
    queryKey: queryKeys.seasons.endCheck(id),
    queryFn: () => apiGet(`/api/v1/seasons/${id}/end-check`, seasonEndCheckSchema),
    enabled: id !== null,
    ...LIVE_CHECK,
  });
}

/**
 * POST /seasons/:id/end. Ending moves the season's status, the ending staff
 * member's scopes (the server invalidates their token; the client rotates it and
 * re-reads /me) and every figure built from the season, so the roots are
 * invalidated, not one leaf.
 */
export function useEndSeason(id: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EndSeasonRequest) =>
      apiSend("post", `/api/v1/seasons/${loadedId(id)}/end`, body, endSeasonResponseSchema),
    onSuccess: () => {
      // Not the end-check: it is mounted on the screen that ends the season, and
      // refetching it now would answer season_not_active and flash an error
      // before the screen navigates away.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seasons.all,
        predicate: (q) => !isSeasonCheckKey(q.queryKey, "end-check"),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      // A graduating season moves its graduates to the alumni list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

/**
 * GET /seasons/:id/results: the season, the criteria End used and each result. A super or the
 * season's (former) admin; anyone else is answered 403, which the screen says in words.
 */
export function useSeasonResults(id: number | null): UseQueryResult<SeasonResultsResponse> {
  return useQuery({
    queryKey: queryKeys.seasons.results(id),
    queryFn: () => apiGet(`/api/v1/seasons/${id}/results`, seasonResultsResponseSchema),
    enabled: id !== null,
  });
}

export function useUpdateSeasonResult(id: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...body }: UpdateSeasonResultRequest & { userId: number }) => {
      await apiClient.patch(`/api/v1/seasons/${loadedId(id)}/results/${userId}`, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.results(id) });
      // Passed on a graduating season moves them to the alumni list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

/** GET /seasons/overdue: seasons past their end date and still active, for those who may end them. */
export function useOverdueSeasons(enabled: boolean): UseQueryResult<OverdueSeasonsResponse["seasons"]> {
  return useQuery({
    queryKey: queryKeys.seasons.overdue(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/seasons/overdue");
      return overdueSeasonsResponseSchema.parse(res.data.data).seasons;
    },
    enabled,
  });
}
