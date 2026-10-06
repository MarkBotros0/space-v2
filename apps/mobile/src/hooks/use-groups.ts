import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  groupDetailSchema,
  groupListItemSchema,
  type GroupDetail,
  type GroupListItem,
  type UserRole,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const groupListSchema = z.array(groupListItemSchema);

/**
 * The roles `GET /groups` actually serves. `listMyGroups` returns `[]` for
 * everyone else by design (staff above leader are not *in* groups), so the
 * screen must not query for them and present that `[]` as "no groups".
 */
export const MY_GROUPS_ROLES: readonly UserRole[] = ["LEADER", "STUDENT"];

export function useMyGroups(enabled: boolean): UseQueryResult<GroupListItem[]> {
  return useQuery({
    queryKey: queryKeys.groups.mine(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/groups");
      return groupListSchema.parse(res.data.data.groups);
    },
    enabled,
  });
}

export function useGroupDetail(id: number | null): UseQueryResult<GroupDetail> {
  return useQuery({
    queryKey: queryKeys.groups.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/groups/${id}`);
      return groupDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

const seasonGroupListSchema = z.array(groupListItemSchema);

/**
 * A season's groups — GET /seasons/:id/groups, which the server already
 * narrows (a leader gets only the groups they lead). The assignment form's
 * group picker and the "Assigned to" labels read it; Plan 6's admin group
 * screens reuse it rather than adding a second hook.
 */
export function useSeasonGroups(seasonId: number | null): UseQueryResult<GroupListItem[]> {
  return useQuery({
    queryKey: queryKeys.groups.bySeason(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/groups`);
      return seasonGroupListSchema.parse(res.data.data.groups);
    },
    enabled: seasonId !== null,
  });
}
