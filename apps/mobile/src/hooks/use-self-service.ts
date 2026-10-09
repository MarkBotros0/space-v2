import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  myAttendanceResponseSchema,
  myProfileResponseSchema,
  mySeasonResponseSchema,
  seasonHistoryResponseSchema,
  type MyAttendanceResponse,
  type MyProfile,
  type MySeason,
  type SeasonHistoryRow,
  type UpdateOwnProfileInput,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { useSessionStore } from "../store/session";

/*
 * The student's own reads (Plan 11). Every endpoint resolves its subject from
 * the token — these hooks never send an id. Each is gated: the season-scoped
 * ones on a non-null season (spec 04 R93: no season, no queries), the rest on
 * the caller's role (staff get 403 from these endpoints).
 */

export function useSeasonHistory(
  activeSeasonId: number | null,
  enabled: boolean,
): UseQueryResult<SeasonHistoryRow[]> {
  return useQuery({
    queryKey: queryKeys.me.seasonHistory(activeSeasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/season-history");
      return seasonHistoryResponseSchema.parse(res.data.data).seasons;
    },
    enabled,
  });
}

export function useMySeason(seasonId: number | null): UseQueryResult<MySeason | null> {
  return useQuery({
    queryKey: queryKeys.me.season(seasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/season");
      return mySeasonResponseSchema.parse(res.data.data).season;
    },
    enabled: seasonId !== null,
  });
}

/** Plan 16's dashboard budget/streak tile reads this same hook and key (spec 19 §7). */
export function useMyAttendance(seasonId: number | null): UseQueryResult<MyAttendanceResponse> {
  return useQuery({
    queryKey: queryKeys.me.attendance(seasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/attendance");
      return myAttendanceResponseSchema.parse(res.data.data);
    },
    enabled: seasonId !== null,
  });
}

export function useMyProfile(enabled: boolean): UseQueryResult<MyProfile> {
  return useQuery({
    queryKey: queryKeys.me.profile(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/profile");
      return myProfileResponseSchema.parse(res.data.data).profile;
    },
    enabled,
  });
}

/** PATCH /me/profile; the server's row (parsed — X10) replaces the cached one. */
export function useUpdateStudentProfile(): UseMutationResult<MyProfile, Error, UpdateOwnProfileInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateOwnProfileInput) => {
      const res = await apiClient.patch("/api/v1/me/profile", body);
      return myProfileResponseSchema.parse(res.data.data).profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.me.profile(), profile);
      // The profile form renames the student too (v1 parity, 18-settings R38):
      // fold the server's name into the session so the header menu agrees.
      const { user, scopes, setSession } = useSessionStore.getState();
      if (user && scopes && user.name !== profile.name) setSession({ ...user, name: profile.name }, scopes);
    },
  });
}
