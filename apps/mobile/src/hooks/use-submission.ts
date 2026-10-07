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
    mutationFn: async () => {
      const res = await apiClient.put(`/api/v1/submissions/by-assignment/${assignmentId}`);
      return ensureSubmissionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      // The detail's mySubmission went from null to a row.
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
    },
  });
}

export function useSubmissionDetail(publicId: string | null): UseQueryResult<SubmissionDetail> {
  return useQuery({
    queryKey: queryKeys.submissions.detail(publicId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/submissions/${publicId}`);
      return submissionDetailSchema.parse(res.data.data);
    },
    enabled: publicId !== null,
  });
}

export function useSaveSubmission(publicId: string, assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.queues() });
    },
  });
}
