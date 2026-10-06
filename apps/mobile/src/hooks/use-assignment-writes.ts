import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assignmentDeletedResponseSchema,
  assignmentDetailSchema,
  type AssignmentWriteRequest,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/**
 * Create, edit, delete. Each parses its response with the shared schema
 * (ruling X10) — create and edit return the full AssignmentDetail, so the
 * detail cache is seeded from the response instead of refetched.
 */
export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ seasonId, body }: { seasonId: number; body: AssignmentWriteRequest }) => {
      const res = await apiClient.post(`/api/v1/seasons/${seasonId}/assignments`, body);
      return assignmentDetailSchema.parse(res.data.data);
    },
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
    mutationFn: async (body: AssignmentWriteRequest) => {
      const res = await apiClient.patch(`/api/v1/assignments/${id}`, body);
      return assignmentDetailSchema.parse(res.data.data);
    },
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
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/api/v1/assignments/${id}`);
      return assignmentDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: (_deleted, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.assignments.detail(id) });
      queryClient.removeQueries({ queryKey: queryKeys.assignments.tracker(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}
