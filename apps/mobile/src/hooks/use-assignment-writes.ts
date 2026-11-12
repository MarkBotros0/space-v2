import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  assignmentDeletedResponseSchema,
  assignmentDetailSchema,
  assignmentSavedResponseSchema,
  assignmentStaffMarkSchema,
  type AssignmentDetail,
  type AssignmentWriteRequest,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
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

/**
 * What a staff mark moves: the assignment's progress, the season's assignment lists (their
 * counts), the students' pages, every passing figure and engagement (its At risk counts staff marks). Also after a refusal, since a 409
 * (season_finished, work_changed) means the screen is showing an old answer.
 */
function invalidateAfterMark(queryClient: QueryClient, assignmentId: number) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.progress(assignmentId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.passing.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.engagement.all });
}

/** Staff mark the assignment submitted for a student who did it outside the app (a second mark keeps the first). */
export function useMarkSubmitted(assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: DASHBOARD_META,
    mutationFn: ({ studentUserId }: { studentUserId: number }) =>
      apiSend(
        "put",
        `/api/v1/assignments/${assignmentId}/submitted-marks/${studentUserId}`,
        undefined,
        assignmentStaffMarkSchema,
      ),
    onSettled: () => invalidateAfterMark(queryClient, assignmentId),
  });
}

/** Takes a staff mark away, whoever made it; 204, so there is no body to parse. */
export function useUndoMarkSubmitted(assignmentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: DASHBOARD_META,
    mutationFn: async ({ studentUserId }: { studentUserId: number }) => {
      await apiClient.delete(`/api/v1/assignments/${assignmentId}/submitted-marks/${studentUserId}`);
    },
    onSettled: () => invalidateAfterMark(queryClient, assignmentId),
  });
}
