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
  type UserRole,
  type UserStatus,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * What an account write (create, role change, deactivate, reactivate) can
 * change beyond the users screens: the students lists (a STUDENT appears,
 * changes role or is deactivated), the season detail's leader names and
 * student counts, group rosters, and the dashboards' headcounts.
 */
export const ACCOUNT_WRITE_KEYS = [
  queryKeys.users.all,
  queryKeys.students.all,
  queryKeys.seasons.all,
  queryKeys.groups.all,
  queryKeys.dashboard.all,
] as const;

function useInvalidateAfterAccountWrite(): () => void {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of ACCOUNT_WRITE_KEYS) void queryClient.invalidateQueries({ queryKey });
  };
}

/** The list's server-side filters. `role`/`status` are optional so the users screen's key stays `{ q }`. */
interface UserListFilters {
  q: string;
  role?: UserRole;
  status?: UserStatus;
}

async function fetchUsersPage(filters: UserListFilters, cursor: number | null): Promise<UserListResponse> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
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
  filters: UserListFilters,
  options: { enabled: boolean },
): UseInfiniteQueryResult<InfiniteData<UserListResponse>> {
  return useInfiniteQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: ({ pageParam }) => fetchUsersPage(filters, pageParam),
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
    // Settled, not success: a refusal (already_activated, user_deleted) means
    // the cached status is stale too.
    onSettled: () => {
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
export function useUpdateUser(): UseMutationResult<UserDetail, Error, { userId: number; body: UpdateUserBody }> {
  const invalidate = useInvalidateAfterAccountWrite();
  return useMutation({
    mutationFn: async ({ userId, body }) => {
      const res = await apiClient.patch(`/api/v1/users/${userId}`, body);
      return userDetailSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useSetActivation(): UseMutationResult<
  ActivationResponse,
  Error,
  { userId: number; action: "deactivate" | "reactivate" }
> {
  const invalidate = useInvalidateAfterAccountWrite();
  return useMutation({
    mutationFn: async ({ userId, action }) => {
      const res = await apiClient.post(`/api/v1/users/${userId}/${action}`);
      // Parsed, not discarded or cast (ruling X10).
      return activationResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

/** POST /users — invite-first; the response carries no credential (Plan 9). */
export function useCreateUser(): UseMutationResult<CreateUserResponse, Error, CreateUserBody> {
  const invalidate = useInvalidateAfterAccountWrite();
  return useMutation({
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/users", body);
      return createUserResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
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
