import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  ensureSubmissionResponseSchema,
  reviewSubmissionResponseSchema,
  saveSubmissionResponseSchema,
  submissionDetailSchema,
  type SubmissionDetail,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

/**
 * PUT /submissions/by-assignment/:id — idempotent create-or-fetch. The server
 * guarantees a repeat call returns the same row untouched, which is what makes
 * it safe to wire to a button on a screen that can remount.
 */
export function useEnsureSubmission(assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Today's rows come from the dashboard, and they read this new row's status too.
    meta: DASHBOARD_META,
    // Offline, fail now into the screen's own copy rather than pause with the
    // button spinning; see useSaveSubmission.
    networkMode: "always",
    mutationFn: async () => {
      const res = await apiClient.put(`/api/v1/submissions/by-assignment/${assignmentId}`);
      return ensureSubmissionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      // The detail's mySubmission went from null to a row, and the lists' PENDING to DRAFT.
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}

async function fetchSubmission(publicId: string) {
  const res = await apiClient.get(`/api/v1/submissions/${publicId}`);
  return submissionDetailSchema.parse(res.data.data);
}

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
      staleTime: 30_000,
    });
}

export function useSaveSubmission(publicId: string, assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    // Paused offline, the confirm dialog sits on "Working…" with Cancel disabled
    // and the submit goes out on reconnect. Fail now and let the student retry.
    networkMode: "always",
    mutationFn: async (input: { text: string; submit?: boolean }) => {
      // `submit` is omitted (not sent as false) on a plain save — the wire
      // contract treats absence and false identically, and omitting keeps the
      // payload byte-for-byte what the test pins.
      const body: { text: string; submit?: boolean } = { text: input.text };
      if (input.submit) body.submit = true;
      const res = await apiClient.patch(`/api/v1/submissions/${publicId}`, body);
      return saveSubmissionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}

export function useReviewSubmission(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (input: { feedback: string; returnForRevision?: boolean }) => {
      const body: { feedback: string; returnForRevision?: boolean } = {
        feedback: input.feedback,
      };
      if (input.returnForRevision) body.returnForRevision = true;
      const res = await apiClient.post(`/api/v1/submissions/${publicId}/review`, body);
      return reviewSubmissionResponseSchema.parse(res.data.data);
    },
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
 * Every cache a verdict makes stale: the submission and the queues, the
 * student's submissions tab and engagement score, and the assignment's detail
 * and tracker (both show per-student status). Without the detail in cache the
 * student and assignment are unknown, so their subtrees are invalidated whole.
 */
export function reviewInvalidations(
  publicId: string,
  detail: Pick<SubmissionDetail, "studentUserId" | "assignmentId"> | undefined,
): readonly (readonly unknown[])[] {
  const common = [
    queryKeys.submissions.detail(publicId),
    queryKeys.submissions.queues(),
    // Both the staff read and the student's own "self" arm sit under student(id).
    detail ? queryKeys.engagement.student(detail.studentUserId) : queryKeys.engagement.all,
  ];
  if (!detail) {
    return [...common, queryKeys.students.details(), queryKeys.assignments.details(), queryKeys.assignments.trackers()];
  }
  return [
    ...common,
    queryKeys.students.submissions(detail.studentUserId),
    queryKeys.assignments.detail(detail.assignmentId),
    queryKeys.assignments.tracker(detail.assignmentId),
  ];
}
