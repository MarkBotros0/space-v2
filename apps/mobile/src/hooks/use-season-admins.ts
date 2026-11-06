import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  seasonAdminListResponseSchema,
  staffCandidatesResponseSchema,
  type SeasonAdminItem,
  type StaffCandidate,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * What a season admin add or remove can change beyond the admins list: the
 * season detail (its `canAdminister` and the seasons an ADMIN sees), the user
 * detail's `adminSeasons` (and its demotion warning), and the dashboards.
 */
export const SEASON_ADMIN_WRITE_KEYS = [
  queryKeys.seasons.all,
  queryKeys.users.all,
  queryKeys.dashboard.all,
] as const;

/** GET /seasons/:id/admins — SUPER-only, so the caller passes `enabled`. */
export function useSeasonAdmins(
  seasonId: number | null,
  options: { enabled: boolean },
): UseQueryResult<SeasonAdminItem[]> {
  return useQuery({
    queryKey: queryKeys.seasons.admins(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/admins`);
      return seasonAdminListResponseSchema.parse(res.data.data).admins;
    },
    enabled: options.enabled && seasonId !== null,
  });
}

/**
 * GET /seasons/:id/staff-candidates — who can take a staff seat: live alumni
 * with no active role. The caller passes `enabled` (season admins and SUPER).
 */
export function useStaffCandidates(
  seasonId: number | null,
  options: { enabled: boolean },
): UseQueryResult<StaffCandidate[]> {
  return useQuery({
    queryKey: queryKeys.seasons.staffCandidates(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/staff-candidates`);
      return staffCandidatesResponseSchema.parse(res.data.data).people;
    },
    enabled: options.enabled && seasonId !== null,
  });
}

function useSeasonAdminWrite<TVars>(
  seasonId: number,
  send: (vars: TVars) => Promise<{ data: { data: unknown } }>,
): UseMutationResult<SeasonAdminItem[], Error, TVars> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const res = await send(vars);
      return seasonAdminListResponseSchema.parse(res.data.data).admins;
    },
    onSuccess: (admins) => {
      // The response IS the new list: seed it so the card updates without a
      // round trip, then refresh everything else the grant touches.
      queryClient.setQueryData(queryKeys.seasons.admins(seasonId), admins);
      for (const queryKey of SEASON_ADMIN_WRITE_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

/** POST /seasons/:id/admins — idempotent server-side. */
export function useAddSeasonAdmin(seasonId: number) {
  return useSeasonAdminWrite<{ userId: number }>(seasonId, ({ userId }) =>
    apiClient.post(`/api/v1/seasons/${seasonId}/admins`, { userId }),
  );
}

/** DELETE /seasons/:id/admins/:userId — idempotent server-side. */
export function useRemoveSeasonAdmin(seasonId: number) {
  return useSeasonAdminWrite<{ userId: number }>(seasonId, ({ userId }) =>
    apiClient.delete(`/api/v1/seasons/${seasonId}/admins/${userId}`),
  );
}
