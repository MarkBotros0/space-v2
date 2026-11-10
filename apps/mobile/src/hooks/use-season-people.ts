import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  addSeasonEnrollmentsResponseSchema,
  peopleCandidatesResponseSchema,
  type AddSeasonEnrollmentsBody,
  type PeopleCandidatesResponse,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { loadedId } from "../lib/loaded-id";

/** GET /seasons/:id/people-candidates — season admins and SUPER, so the caller passes `enabled`. */
export function useSeasonPeople(
  seasonId: number | null,
  options: { enabled: boolean },
): UseQueryResult<PeopleCandidatesResponse> {
  return useQuery({
    queryKey: queryKeys.seasons.peopleCandidates(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/people-candidates`);
      return peopleCandidatesResponseSchema.parse(res.data.data);
    },
    enabled: options.enabled && seasonId !== null,
  });
}

/**
 * POST /seasons/:id/enrollments — all or nothing. On success the roster and the
 * candidates (everything under `seasons`, which also holds the season's student
 * count) refresh; a refusal changes nothing, so the screen refetches itself.
 */
export function useAddSeasonPeople(seasonId: number): UseMutationResult<number, Error, AddSeasonEnrollmentsBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddSeasonEnrollmentsBody) => {
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/enrollments`, body);
      return addSeasonEnrollmentsResponseSchema.parse(res.data.data).added;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups.roster(seasonId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.peopleCandidates(seasonId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
    },
  });
}

/**
 * DELETE /seasons/:id/enrollments/:userId — takes someone off a draft's roster
 * (409 `has_work` once they have work or attendance). Refreshes the roster,
 * the candidates, the season's student count and the student's own record.
 */
export function useRemoveSeasonPerson(seasonId: number | null): UseMutationResult<void, Error, { userId: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) => {
      await apiClient.delete(`/api/v1/seasons/${loadedId(seasonId)}/enrollments/${userId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups.roster(seasonId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.peopleCandidates(seasonId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
    },
  });
}
