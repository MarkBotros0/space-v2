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

import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

// A forum is the FORUM part of an assignment: every path hangs off
// /assignments/:id/parts/:partId/forum. Deleting a comment keeps its own path.

const forumPath = (assignmentId: number, partId: number) => `/api/v1/assignments/${assignmentId}/parts/${partId}/forum`;

/**
 * The thread, one page at a time. The first page carries `own`, `locked` and
 * the part's settings; later pages only add posts. An infinite query rather
 * than a plain one so "Load more" appends instead of replacing.
 */
export function useForumThread(
  assignmentId: number | null,
  partId: number | null,
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<ForumView, string | null>> {
  return useInfiniteQuery({
    queryKey: queryKeys.forum.thread(assignmentId ?? -1, partId ?? -1),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const base = forumPath(assignmentId as number, partId as number);
      return apiGet(pageParam === null ? base : `${base}?cursor=${encodeURIComponent(pageParam)}`, forumViewSchema);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: enabled && assignmentId !== null && partId !== null,
  });
}

/**
 * The rest of one post's comments, behind "Show all comments". The thread
 * inlines at most three per post; this pages through the comments endpoint
 * with its numeric cursor. `enabled` stays false until the press, so opening a
 * thread issues one request, not one per post.
 */
export function useForumComments(assignmentId: number, partId: number, postPublicId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.forum.comments(assignmentId, postPublicId),
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const base = `${forumPath(assignmentId, partId)}/posts/${postPublicId}/comments`;
      return apiGet(pageParam === null ? base : `${base}?cursor=${pageParam}`, forumCommentsPageSchema);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

function useInvalidateThread(assignmentId: number, partId: number) {
  const queryClient = useQueryClient();
  return (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.forum.thread(assignmentId, partId) });
    // Expanded comment lists live under forum.comments(...); a new or removed
    // comment must refresh them too. Prefix-match on the forum subtree.
    void queryClient.invalidateQueries({ queryKey: queryKeys.forum.allComments(assignmentId) });
  };
}

/**
 * Posts the student's response: their work on the FORUM part. PUT, and
 * idempotent: calling it twice with the same text yields the same work. A
 * post makes the part done, so the assignment's detail, lists and progress
 * refresh with the thread.
 */
export function useSubmitForumResponse(assignmentId: number, partId: number) {
  const queryClient = useQueryClient();
  const invalidateThread = useInvalidateThread(assignmentId, partId);
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    // Offline, fail now into the form's error rather than sit on "Posting…".
    networkMode: "always",
    mutationFn: (text: string) =>
      apiSend("put", `${forumPath(assignmentId, partId)}/response`, { text }, forumOwnResponseSchema),
    onSuccess: () => {
      invalidateThread();
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.progress(assignmentId) });
    },
  });
}

export function usePostComment(assignmentId: number, partId: number) {
  const invalidate = useInvalidateThread(assignmentId, partId);
  return useMutation({
    mutationFn: (vars: { postPublicId: string; body: string }) =>
      apiSend(
        "post",
        `${forumPath(assignmentId, partId)}/posts/${vars.postPublicId}/comments`,
        { body: vars.body },
        addForumCommentResponseSchema,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteComment(assignmentId: number, partId: number) {
  const invalidate = useInvalidateThread(assignmentId, partId);
  return useMutation({
    mutationFn: (commentId: number) =>
      apiSend("delete", `/api/v1/forum/comments/${commentId}`, undefined, deleteForumCommentResponseSchema),
    onSuccess: invalidate,
  });
}
