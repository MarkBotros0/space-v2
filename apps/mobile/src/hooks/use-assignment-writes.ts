import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assignmentDeletedResponseSchema,
  assignmentDetailSchema,
  assignmentSavedResponseSchema,
  type AssignmentDetail,
  type AssignmentWriteRequest,
} from "@space/shared";

import { needsConfirmation } from "../lib/api-error";
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

/**
 * What a save came to: saved (with how many students' submitted work it sent
 * back to To do), or a change to students' work the server wants confirmed
 * first — re-send the body with `confirm: true` to go ahead.
 */
type AssignmentUpdateResult =
  { kind: "saved"; detail: AssignmentDetail; reopened: number } | { kind: "confirm"; students: number };

/**
 * A full replace (spec 07 R67): `body` is the whole assignment, its parts in
 * order, never a diff. A 409 `needs_confirmation` is an answer, not a failure:
 * it resolves as `{ kind: "confirm", students }` so the form can ask.
 */
export function useUpdateAssignment(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (body: AssignmentWriteRequest): Promise<AssignmentUpdateResult> => {
      try {
        const { reopened, ...detail } = await apiSend(
          "patch",
          `/api/v1/assignments/${id}`,
          body,
          assignmentSavedResponseSchema,
        );
        return { kind: "saved", detail, reopened };
      } catch (err) {
        const students = needsConfirmation(err);
        if (students === null) throw err;
        return { kind: "confirm", students };
      }
    },
    onSuccess: (result) => {
      if (result.kind === "confirm") return;
      queryClient.setQueryData(queryKeys.assignments.detail(id), result.detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
      // A changed part changes every student's row.
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.progress(id) });
      // Reopened work leaves the reviewers' queues.
      if (result.reopened > 0) void queryClient.invalidateQueries({ queryKey: queryKeys.submissions.queues() });
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
      queryClient.removeQueries({ queryKey: queryKeys.assignments.progress(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}
