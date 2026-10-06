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
  bulkInviteResponseSchema,
  createUserResponseSchema,
  inviteStateSchema,
  pendingInvitesResponseSchema,
  userDetailSchema,
  userListResponseSchema,
  type ActivationResponse,
  type BulkInviteResponse,
  type CreateUserBody,
  type CreateUserResponse,
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


/** POST /users — invite-first; the response carries no credential (Plan 9). */
export function useCreateUser(): UseMutationResult<CreateUserResponse, Error, CreateUserBody> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/users", body);
      return createUserResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

/** How many accounts "Send pending invites" would reach (R87: hidden at zero). */
export function usePendingInviteCount(enabled: boolean): UseQueryResult<number> {
  return useQuery({
    queryKey: queryKeys.users.pendingInvites(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/users/invites/pending");
      return pendingInvitesResponseSchema.parse(res.data.data).pending;
    },
    enabled,
  });
}

/**
 * One bounded batch (Plan 10 Decision 12). The timeout is raised from the
 * client's 15 s default: a batch is up to 20 SMTP sends, 5 at a time.
 */
export function useSendPendingInvites(): UseMutationResult<BulkInviteResponse, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post("/api/v1/users/invites/pending", undefined, { timeout: 60_000 });
      return bulkInviteResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
