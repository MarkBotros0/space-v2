import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  mentorDashboardSchema,
  staffSeasonDashboardSchema,
  studentDashboardSchema,
  type MentorDashboard,
  type StaffSeasonDashboard,
  type StudentDashboard,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * Home is every role's most-refetched screen; a minute of freshness absorbs
 * focus/remount churn without letting the at-risk list go stale beyond that
 * (spec 19 §7, spec 09 §5 item 3).
 */
export const DASHBOARD_STALE_TIME = 60_000;

/*
 * One hook per variant, each parsing against ITS arm, not the union: a server
 * that answers a student with the staff shape fails here (X10, C8 #2) instead
 * of rendering. The role picks the hook; the hook never trusts the response
 * to say who the caller is.
 */

/** The server resolves the season from the token; the id is only the cache key. */
export function useStudentDashboard(activeSeasonId: number | null): UseQueryResult<StudentDashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard.me(activeSeasonId),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/dashboard");
      return studentDashboardSchema.parse(res.data.data);
    },
    staleTime: DASHBOARD_STALE_TIME,
  });
}

/** ADMIN / LEADER. Gated: no current season → no request (the screen says "No season yet"). */
export function useSeasonStaffDashboard(seasonId: number | null): UseQueryResult<StaffSeasonDashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard.me(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/me/dashboard?seasonId=${seasonId}`);
      return staffSeasonDashboardSchema.parse(res.data.data);
    },
    enabled: seasonId !== null,
    staleTime: DASHBOARD_STALE_TIME,
  });
}

export function useMentorDashboard(): UseQueryResult<MentorDashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard.me(null),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/me/dashboard");
      return mentorDashboardSchema.parse(res.data.data);
    },
    staleTime: DASHBOARD_STALE_TIME,
  });
}
