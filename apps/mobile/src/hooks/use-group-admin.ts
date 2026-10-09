import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import type { groupWriteRequestSchema } from "@space/shared";
import {
  groupAssignmentsResponseSchema,
  groupDeleteResponseSchema,
  groupImpactSchema,
  groupRefResponseSchema,
  leaderOptionSchema,
  seasonRosterRowSchema,
  studentOptionSchema,
  type GroupAssignmentsRequest,
  type GroupImpact,
  type LeaderOption,
  type SeasonRosterRow,
  type StudentOption,
  type UserRole,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

/** Roles that browse groups by season (D-16.16). LEADER/STUDENT keep Plan 2's MY_GROUPS_ROLES branch. */
export const SEASON_GROUPS_ROLES: readonly UserRole[] = ["ADMIN", "SUPER"];

export type GroupWriteInput = z.input<typeof groupWriteRequestSchema>;

const leaderListSchema = z.array(leaderOptionSchema);
const rosterSchema = z.array(seasonRosterRowSchema);
const studentListSchema = z.array(studentOptionSchema);

/**
 * A membership write can change groups the caller never touched
 * (GroupStudent is globally unique, spec 05 R3) and the season detail's
 * group cards — invalidate both roots (spec 05 §8), never a leaf.
 */
function useInvalidateGroupData() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
  };
}

export function useLeaderOptions(enabled: boolean): UseQueryResult<LeaderOption[]> {
  return useQuery({
    queryKey: queryKeys.groups.leaderOptions(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/groups/leader-options");
      return leaderListSchema.parse(res.data.data.leaders);
    },
    enabled,
  });
}

/**
 * GET /groups/student-options — every live STUDENT user, name asc: the group
 * form's picker (v1 groups-query.ts:112-121; v1 parity 2026-10-09, spec 05 R18/R78).
 */
export function useStudentOptions(enabled: boolean): UseQueryResult<StudentOption[]> {
  return useQuery({
    queryKey: queryKeys.groups.studentOptions(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/groups/student-options");
      return studentListSchema.parse(res.data.data.students);
    },
    enabled,
  });
}

/** GET /seasons/:id/roster (D-16.11) — the grid, the group edit form's pre-selection, and Plan 17's import screen. */
export function useSeasonRoster(seasonId: number | null): UseQueryResult<SeasonRosterRow[]> {
  return useQuery({
    queryKey: queryKeys.groups.roster(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/roster`);
      return rosterSchema.parse(res.data.data.roster);
    },
    enabled: seasonId !== null,
  });
}

export function useGroupImpact(id: number | null): UseQueryResult<GroupImpact> {
  return useQuery({
    queryKey: queryKeys.groups.impact(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/groups/${id}/impact`);
      return groupImpactSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

export function useCreateGroup(seasonId: number) {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    mutationFn: async (body: GroupWriteInput) => {
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/groups`, body);
      return groupRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGroup(id: number) {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    mutationFn: async (body: GroupWriteInput) => {
      const res = await apiClient.patch(`/api/v1/groups/${id}`, body);
      return groupRefResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/groups/${id}`);
      return groupDeleteResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useSaveGroupAssignments(seasonId: number) {
  const invalidate = useInvalidateGroupData();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (body: GroupAssignmentsRequest) => {
      const res = await apiClient.put(`/api/v1/seasons/${seasonId}/group-assignments`, body);
      return groupAssignmentsResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
