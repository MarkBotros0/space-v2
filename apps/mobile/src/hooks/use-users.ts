import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  activationResponseSchema,
  inviteStateSchema,
  userDetailSchema,
  userListResponseSchema,
  type ActivationResponse,
  type InviteState,
  type UpdateUserBody,
  type UserDetail,
  type UserListResponse,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

async function fetchUsersPage(q: string, cursor: number | null): Promise<UserListResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (cursor !== null) params.set("cursor", String(cursor));
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const res = await apiClient.get(`/api/v1/users${suffix}`);
  return userListResponseSchema.parse(res.data.data);
}

/**
 * Cursor-paginated users list — the pagination v1's page never had (R84).
 *
 * `enabled` is required, not defaulted: the screen calls this hook before its
 * SUPER guard (hooks cannot sit behind an early return), and a non-SUPER must
 * not fire a request the API will 403 (CLAUDE.md "Data fetching" — queries
 * that depend on something nullable pass `enabled`).
 */
export function useUsers(
  filters: { q: string },
  options: { enabled: boolean },
): UseInfiniteQueryResult<InfiniteData<UserListResponse>> {
  return useInfiniteQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: ({ pageParam }) => fetchUsersPage(filters.q, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: options.enabled,
  });
}

/** POST /users/:id/invite — the response is metadata only, never a token. */
export function useSendInvite(): UseMutationResult<InviteState, Error, { userId: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }) => {
      const res = await apiClient.post(`/api/v1/users/${userId}/invite`);
      return inviteStateSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUserDetail(id: number | null): UseQueryResult<UserDetail> {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/users/${id}`);
      return userDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/** Full replace of the three editable fields (Decision 9). */
export function useUpdateUser(): UseMutationResult<
  UserDetail,
  Error,
  { userId: number; body: UpdateUserBody }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, body }) => {
      const res = await apiClient.patch(`/api/v1/users/${userId}`, body);
      return userDetailSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useSetActivation(): UseMutationResult<
  ActivationResponse,
  Error,
  { userId: number; action: "deactivate" | "reactivate" }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, action }) => {
      const res = await apiClient.post(`/api/v1/users/${userId}/${action}`);
      // Parsed, not discarded or cast (ruling X10).
      return activationResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
