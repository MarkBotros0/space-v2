import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  inviteStateSchema,
  userListResponseSchema,
  type InviteState,
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
