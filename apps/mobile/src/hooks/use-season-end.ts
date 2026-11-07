import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  endSeasonResponseSchema,
  overdueSeasonsResponseSchema,
  seasonEndCheckSchema,
  seasonResultRowSchema,
  type EndSeasonRequest,
  type OverdueSeasonsResponse,
  type SeasonEndCheck,
  type SeasonResultRow,
  type UpdateSeasonResultRequest,
} from "@space/shared";
import { z } from "zod";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const resultsSchema = z.array(seasonResultRowSchema);

/** GET /seasons/:id/end-check: what blocks the end, and the students it would end for. */
export function useSeasonEndCheck(id: number | null): UseQueryResult<SeasonEndCheck> {
  return useQuery({
    queryKey: queryKeys.seasons.endCheck(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${id}/end-check`);
      return seasonEndCheckSchema.parse(res.data.data);
    },
    enabled: id !== null,
    // The check is a live answer for a decision; never serve an old one.
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * POST /seasons/:id/end. Ending moves the season's status, the ending staff
 * member's scopes (the server invalidates their token; the client rotates it and
 * re-reads /me) and every figure built from the season, so the roots are
 * invalidated, not one leaf.
 */
export function useEndSeason(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: EndSeasonRequest) => {
      const res = await apiClient.post(`/api/v1/seasons/${id}/end`, body);
      return endSeasonResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      // Not the end-check: it is mounted on the screen that ends the season, and
      // refetching it now would answer season_not_active and flash an error
      // before the screen navigates away.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.seasons.all,
        predicate: (q) => q.queryKey[1] !== "end-check",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      // A graduating season moves its graduates to the alumni list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

/** GET /seasons/:id/results (SUPER). */
export function useSeasonResults(id: number | null): UseQueryResult<SeasonResultRow[]> {
  return useQuery({
    queryKey: queryKeys.seasons.results(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${id}/results`);
      return resultsSchema.parse(res.data.data.results);
    },
    enabled: id !== null,
  });
}

export function useUpdateSeasonResult(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...body }: UpdateSeasonResultRequest & { userId: number }) => {
      await apiClient.patch(`/api/v1/seasons/${id}/results/${userId}`, body);
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
