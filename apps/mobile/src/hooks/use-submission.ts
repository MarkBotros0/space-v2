import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  handInEssayResponseSchema,
  reviewEssayResponseSchema,
  saveEssayDraftResponseSchema,
  submissionDetailSchema,
  submitAssignmentResponseSchema,
  type SubmissionDetail,
} from "@space/shared";

import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

// One essay is one Submission-like record addressed by its work's publicId:
// the student drafts it, Submit hands every draft in, a reviewer marks it
// reviewed or returns it, and a returned essay is handed in again on its own.

async function fetchSubmission(publicId: string) {
  return apiGet(`/api/v1/submissions/${publicId}`, submissionDetailSchema);
}

/** One essay, for its author or a reviewer. */
export function useSubmissionDetail(publicId: string | null): UseQueryResult<SubmissionDetail> {
  return useQuery({
    queryKey: queryKeys.submissions.detail(publicId),
    queryFn: () => fetchSubmission(publicId as string),
    enabled: publicId !== null,
  });
}

/** Warm the detail on touch-down, so the review screen opens with data already there. */
export function usePrefetchSubmission() {
  const queryClient = useQueryClient();
  return (publicId: string) =>
    void queryClient.prefetchQuery({
      queryKey: queryKeys.submissions.detail(publicId),
      queryFn: () => fetchSubmission(publicId),
    });
}

/** The assignment as every screen shows it: its detail, the lists' rows and the leader's progress. */
function invalidateAssignment(queryClient: QueryClient, assignmentId: number): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.progress(assignmentId) });
}

/**
 * PUT /assignments/:id/parts/:partId/essay — save the draft (made on the first
 * save). Never hands it in: Submit does that. Its word count can make the part
 * done, so the assignment's rows refresh.
 */
export function useSaveEssayDraft(assignmentId: number, partId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: a draft inside its range moves the parts-left count on Home.
    meta: DASHBOARD_META,
    // Paused offline, a save would sit on "Saving…" and go out on reconnect.
    // Fail now and let the screen keep the text and retry.
    networkMode: "always",
    mutationFn: (text: string) =>
      apiSend(
        "put",
        `/api/v1/assignments/${assignmentId}/parts/${partId}/essay`,
        { text },
        saveEssayDraftResponseSchema,
      ),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(saved.publicId) });
      invalidateAssignment(queryClient, assignmentId);
    },
  });
}

/** POST /submissions/:publicId/hand-in — a returned essay, handed in again on its own (no second Submit). */
export function useHandInEssay(publicId: string, assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    networkMode: "always",
    mutationFn: () => apiSend("post", `/api/v1/submissions/${publicId}/hand-in`, undefined, handInEssayResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.queues() });
      invalidateAssignment(queryClient, assignmentId);
    },
  });
}

/**
 * POST /assignments/:id/submit — hands the assignment in, its draft essays
 * with it. Refused with 409 `not_finished` (the message is the blocker line)
 * or `already_submitted`; either way the screen was showing stale work, so
 * the assignment refreshes on a refusal too. Read the refusal with
 * `apiErrorCode` / `apiErrorMessage`.
 */
export function useSubmitAssignment(assignmentId: number, opts: { beforeSend?: () => Promise<void> } = {}) {
  const queryClient = useQueryClient();
  const { beforeSend } = opts;
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    // Offline, fail now into the screen's own copy rather than spin until reconnect.
    networkMode: "always",
    mutationFn: async () => {
      // The screen's writes that must land first (a draft flushed on leaving its essay).
      await beforeSend?.();
      return apiSend("post", `/api/v1/assignments/${assignmentId}/submit`, undefined, submitAssignmentResponseSchema);
    },
    onSuccess: () => {
      // Its essays join the reviewers' queues.
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.queues() });
      invalidateAssignment(queryClient, assignmentId);
    },
    onError: () => invalidateAssignment(queryClient, assignmentId),
  });
}

/** A reviewer's verdict on one essay: `reviewed` (feedback optional) or `return` (a note is required). */
export function useReviewEssay(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (input: { action: "reviewed" | "return"; feedback: string | null }) =>
      apiSend("post", `/api/v1/submissions/${publicId}/review`, input, reviewEssayResponseSchema),
    onSuccess: () => {
      // Read before invalidating: the detail names the student and assignment
      // whose other screens this verdict changes.
      const detail = queryClient.getQueryData<SubmissionDetail>(queryKeys.submissions.detail(publicId));
      for (const queryKey of reviewInvalidations(publicId, detail)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

/**
 * Every cache a verdict makes stale: the essay and the queues, the student's
 * submissions tab and engagement score, and the assignment's detail, progress
 * and the lists (a return takes the assignment out of the submitted count).
 * Without the detail in cache the student and assignment are unknown, so
 * their subtrees are invalidated whole.
 */
export function reviewInvalidations(
  publicId: string,
  detail: Pick<SubmissionDetail, "studentUserId" | "assignmentId"> | undefined,
): readonly (readonly unknown[])[] {
  const common = [
    queryKeys.submissions.detail(publicId),
    queryKeys.submissions.queues(),
    queryKeys.assignments.lists(),
    // Both the staff read and the student's own "self" arm sit under student(id).
    detail ? queryKeys.engagement.student(detail.studentUserId) : queryKeys.engagement.all,
  ];
  if (!detail) {
    return [
      ...common,
      queryKeys.students.details(),
      queryKeys.assignments.details(),
      queryKeys.assignments.progresses(),
    ];
  }
  return [
    ...common,
    queryKeys.students.submissions(detail.studentUserId),
    queryKeys.assignments.detail(detail.assignmentId),
    queryKeys.assignments.progress(detail.assignmentId),
  ];
}
