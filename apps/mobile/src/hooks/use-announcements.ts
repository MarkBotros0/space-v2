import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  announcementDetailSchema,
  announcementPageResponseSchema,
  announcementTargetsResponseSchema,
  announcementUnreadResponseSchema,
  pollVotersResponseSchema,
  type AnnouncementDetail,
  type AnnouncementPageResponse,
  type AnnouncementTargetsResponse,
  type AnnouncementUnreadResponse,
  type CreateAnnouncementRequest,
  type PollVoteRequest,
  type PollVotersResponse,
  type UpdateAnnouncementRequest,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { apiErrorCode, isNotFoundError } from "../lib/api-error";
import { queryKeys } from "../lib/query-keys";

/** What `useAnnouncement` yields for a post that is gone or was never visible to this reader. */
export interface AnnouncementRemoved {
  removed: true;
}

async function fetchPage(cursor: string | null): Promise<AnnouncementPageResponse> {
  const suffix = cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`;
  const res = await apiClient.get(`/api/v1/announcements${suffix}`);
  return announcementPageResponseSchema.parse(res.data.data);
}

/** The feed: newest first, cursor-paged by the server. */
export function useAnnouncementFeed(): UseInfiniteQueryResult<
  InfiniteData<AnnouncementPageResponse>
> {
  return useInfiniteQuery({
    queryKey: queryKeys.announcements.feed(),
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** The unread count and the latest unread post (Home card, More row). */
export function useAnnouncementUnread(): UseQueryResult<AnnouncementUnreadResponse> {
  return useQuery({
    queryKey: queryKeys.announcements.unread(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/announcements/unread");
      return announcementUnreadResponseSchema.parse(res.data.data);
    },
  });
}

/**
 * One post. A 404 is not an error here: it is "This post was removed", so it is
 * mapped to `{ removed: true }` (and never retried, since no retry can change it).
 */
export function useAnnouncement(
  id: number | null,
): UseQueryResult<AnnouncementDetail | AnnouncementRemoved> {
  return useQuery({
    queryKey: queryKeys.announcements.detail(id),
    queryFn: async (): Promise<AnnouncementDetail | AnnouncementRemoved> => {
      try {
        const res = await apiClient.get(`/api/v1/announcements/${id}`);
        return announcementDetailSchema.parse(res.data.data);
      } catch (err) {
        if (isNotFoundError(err)) return { removed: true };
        throw err;
      }
    },
    enabled: id !== null,
  });
}

/** Who the signed-in author may post to, with reach counts. Fetched only when the composer opens. */
export function useAnnouncementTargets(
  enabled: boolean,
): UseQueryResult<AnnouncementTargetsResponse> {
  return useQuery({
    queryKey: queryKeys.announcements.targets(),
    queryFn: async () => {
      const res = await apiClient.get("/api/v1/announcements/targets");
      return announcementTargetsResponseSchema.parse(res.data.data);
    },
    enabled,
  });
}

/** Every write refreshes the whole subtree: the feed, the unread count and the detail. */
function useInvalidateAnnouncements() {
  const queryClient = useQueryClient();
  return (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all });
  };
}

export function useMarkAnnouncementRead() {
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      await apiClient.post(`/api/v1/announcements/${id}/read`);
    },
    onSuccess: invalidate,
  });
}

export function useCreateAnnouncement() {
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: async (body: CreateAnnouncementRequest) => {
      const res = await apiClient.post("/api/v1/announcements", body);
      return announcementDetailSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateAnnouncement(id: number) {
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: async (body: UpdateAnnouncementRequest) => {
      const res = await apiClient.patch(`/api/v1/announcements/${id}`, body);
      return announcementDetailSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAnnouncement() {
  const invalidate = useInvalidateAnnouncements();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      await apiClient.delete(`/api/v1/announcements/${id}`);
    },
    onSuccess: (_data, id) => {
      // Drop the deleted post's own query first: refetching it would 404 and flash
      // "This post was removed" while the screen pops.
      queryClient.removeQueries({ queryKey: queryKeys.announcements.detail(id) });
      invalidate();
    },
  });
}

/**
 * Writes a poll action's returned detail into the post's own query, so the screen updates without a refetch,
 * and drops the voters list, so the next open of "See who voted" never shows names from before the write.
 */
function usePollDetailWrite(postId: number) {
  const queryClient = useQueryClient();
  return (data: unknown): AnnouncementDetail => {
    const next = announcementDetailSchema.parse(data);
    queryClient.setQueryData(queryKeys.announcements.detail(postId), next);
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.feed() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.voters(postId) });
    return next;
  };
}

/** Cast or change a vote. A stale `version` (409 `poll_changed`) refetches the post so the reader sees the new poll. */
export function useVotePoll(postId: number) {
  const queryClient = useQueryClient();
  const write = usePollDetailWrite(postId);
  return useMutation({
    mutationFn: async (body: PollVoteRequest) => {
      const res = await apiClient.put(`/api/v1/announcements/${postId}/poll/vote`, body);
      return write(res.data.data);
    },
    onError: (err) => {
      if (apiErrorCode(err) === "poll_changed") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.detail(postId) });
      }
    },
  });
}

export function useClosePoll(postId: number) {
  const write = usePollDetailWrite(postId);
  return useMutation({
    mutationFn: async (): Promise<AnnouncementDetail> => {
      const res = await apiClient.post(`/api/v1/announcements/${postId}/poll/close`);
      return write(res.data.data);
    },
  });
}

export function useReopenPoll(postId: number) {
  const write = usePollDetailWrite(postId);
  return useMutation({
    mutationFn: async (): Promise<AnnouncementDetail> => {
      const res = await apiClient.post(`/api/v1/announcements/${postId}/poll/reopen`);
      return write(res.data.data);
    },
  });
}

/** Who voted for what; only a poll's managers may read it, so fetch only when the sheet opens. */
export function usePollVoters(
  postId: number,
  enabled: boolean,
): UseQueryResult<PollVotersResponse> {
  return useQuery({
    queryKey: queryKeys.announcements.voters(postId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/announcements/${postId}/poll/voters`);
      return pollVotersResponseSchema.parse(res.data.data);
    },
    enabled,
  });
}
