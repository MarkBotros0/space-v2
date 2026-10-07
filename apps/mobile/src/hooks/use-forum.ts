import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import {
  addForumCommentResponseSchema,
  deleteForumCommentResponseSchema,
  forumCommentsPageSchema,
  forumOwnResponseSchema,
  forumViewSchema,
  type ForumView,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

/**
 * The thread, one page at a time. The first page carries `own`, `locked` and
 * the config values; later pages only add posts. An infinite query rather than
 * a plain one so "Load more" appends instead of replacing.
 */
export function useForumThread(
  assignmentId: number | null,
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<ForumView, string | null>> {
  return useInfiniteQuery({
    queryKey: queryKeys.forum.thread(assignmentId ?? -1),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const base = `/api/v1/assignments/${assignmentId}/forum`;
      const res = await apiClient.get(
        pageParam === null ? base : `${base}?cursor=${encodeURIComponent(pageParam)}`,
      );
      return forumViewSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    // Gated on the assignment being FORUM: a STANDARD assignment has no thread
    // and the endpoint would 404, which is not an error worth rendering.
    enabled: enabled && assignmentId !== null,
  });
}

/**
 * The rest of one post's comments, behind "Show all comments". The thread
 * inlines at most three per post; this pages through the comments endpoint
 * with its numeric cursor. `enabled` stays false until the press, so opening a
 * thread issues one request, not one per post.
 */
export function useForumComments(assignmentId: number, postPublicId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.forum.comments(assignmentId, postPublicId),
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const base = `/api/v1/assignments/${assignmentId}/forum/posts/${postPublicId}/comments`;
      const res = await apiClient.get(pageParam === null ? base : `${base}?cursor=${pageParam}`);
      return forumCommentsPageSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

function useInvalidateThread(assignmentId: number) {
  const queryClient = useQueryClient();
  return (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.forum.thread(assignmentId) });
    // Expanded comment lists live under forum.comments(...); a new or removed
    // comment must refresh them too. Prefix-match on the forum subtree.
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.forum.all, "comments", assignmentId],
    });
    // The post flips the submission's status, which the assignment detail also
    // reports — invalidate it too or the header keeps saying "Not started".
    void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
  };
}

/**
 * The one write that creates the submission row. PUT, and idempotent: calling
 * it twice with the same text yields the same row, which is what makes it safe
 * on a screen React Query remounts and refocuses.
 */
export function useSubmitForumResponse(assignmentId: number) {
  const invalidate = useInvalidateThread(assignmentId);
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (text: string) => {
      const res = await apiClient.put(`/api/v1/assignments/${assignmentId}/forum/response`, {
        text,
      });
      return forumOwnResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function usePostComment(assignmentId: number) {
  const invalidate = useInvalidateThread(assignmentId);
  return useMutation({
    mutationFn: async (vars: { postPublicId: string; body: string }) => {
      const res = await apiClient.post(
        `/api/v1/assignments/${assignmentId}/forum/posts/${vars.postPublicId}/comments`,
        { body: vars.body },
      );
      return addForumCommentResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteComment(assignmentId: number) {
  const invalidate = useInvalidateThread(assignmentId);
  return useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiClient.delete(`/api/v1/forum/comments/${commentId}`);
      return deleteForumCommentResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
