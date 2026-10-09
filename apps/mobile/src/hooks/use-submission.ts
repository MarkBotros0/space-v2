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

/**
 * Save or submit the student's answer.
 *
 * v1 parity 2026-10-09 (08-submissions R1): v1 shows the editor the moment the
 * assignment opens, with no start button (v1 student/assignments/[id]/page.tsx:40).
 * v1 got there by writing a DRAFT on render; v2's GETs stay side-effect free
 * (C6), so when no submission exists yet (`publicId` null) the first save
 * creates it with the idempotent `PUT /submissions/by-assignment/:id` and then
 * writes the text with `PATCH` — one tap, as v1.
 */
export function useSaveSubmission(assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (input: { publicId: string | null; text: string; submit?: boolean }) => {
      let publicId = input.publicId;
      if (publicId === null) {
        const created = await apiClient.put(`/api/v1/submissions/by-assignment/${assignmentId}`);
        publicId = ensureSubmissionResponseSchema.parse(created.data.data).publicId;
      }
      // `submit` is omitted (not sent as false) on a plain save — the wire
      // contract treats absence and false identically, and omitting keeps the
      // payload byte-for-byte what the test pins.
      const body: { text: string; submit?: boolean } = { text: input.text };
      if (input.submit) body.submit = true;
      const res = await apiClient.patch(`/api/v1/submissions/${publicId}`, body);
      return { publicId, ...saveSubmissionResponseSchema.parse(res.data.data) };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(result.publicId) });
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
    // v1 parity 2026-10-09 (08-submissions R21): one action, body { feedback }
    // only — it always sets REVIEWED (v1 submission-actions.ts:167-191).
    mutationFn: async (input: { feedback: string }) => {
      const res = await apiClient.post(`/api/v1/submissions/${publicId}/review`, {
        feedback: input.feedback,
      });
      return reviewSubmissionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.detail(publicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.queues() });
    },
  });
}
