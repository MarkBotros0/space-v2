import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assignmentDeletedResponseSchema, assignmentDetailSchema, type AssignmentWriteRequest } from "@space/shared";

import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";
import { apiSend } from "../lib/api-request";

/**
 * Create, edit, delete. Each parses its response with the shared schema
 * (ruling X10) — create and edit return the full AssignmentDetail, so the
 * detail cache is seeded from the response instead of refetched.
 */
export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: ({ seasonId, body }: { seasonId: number; body: AssignmentWriteRequest }) =>
      apiSend("post", `/api/v1/seasons/${seasonId}/assignments`, body, assignmentDetailSchema),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.assignments.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}

/** A full replace (spec 07 R67): `body` is the whole assignment, never a diff. */
export function useUpdateAssignment(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (body: AssignmentWriteRequest) =>
      apiSend("patch", `/api/v1/assignments/${id}`, body, assignmentDetailSchema),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.assignments.detail(id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
      // Retargeting changes who the tracker lists.
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.tracker(id) });
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (id: number) =>
      apiSend("delete", `/api/v1/assignments/${id}`, undefined, assignmentDeletedResponseSchema),
    onSuccess: (_deleted, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.assignments.detail(id) });
      queryClient.removeQueries({ queryKey: queryKeys.assignments.tracker(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}
