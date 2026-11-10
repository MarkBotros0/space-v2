import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  createStudentResponseSchema,
  enrollmentTransitionResponseSchema,
  graduateStudentResponseSchema,
  inviteStateSchema,
  studentDeletedResponseSchema,
  updateStudentResponseSchema,
  type CreateStudentBody,
  type CreateStudentResponse,
  type EnrollmentTransitionResponse,
  type GraduateStudentResponse,
  type InviteState,
  type StudentDeletedResponse,
  type UpdateStudentBody,
  type UpdateStudentResponse,
} from "@space/shared";

import { apiClient } from "../../lib/api-client";
import { DASHBOARD_META } from "../../lib/dashboard-invalidation";
import { queryKeys } from "../../lib/query-keys";
import { apiSend } from "../../lib/api-request";

/** POST /students — the server mints and mails the invite (Plan 10 Decision 1). */
export function useCreateStudent(): UseMutationResult<CreateStudentResponse, Error, CreateStudentBody> {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (body) => apiSend("post", "/api/v1/students", body, createStudentResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdateStudent(): UseMutationResult<
  UpdateStudentResponse,
  Error,
  { id: number; body: UpdateStudentBody }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => apiSend("patch", `/api/v1/students/${id}`, body, updateStudentResponseSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

export function useGraduateStudent(): UseMutationResult<
  GraduateStudentResponse,
  Error,
  { id: number; graduationYear: number; override?: boolean; overrideReason?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async ({ id, graduationYear, override, overrideReason }) => {
      return apiSend(
        "post",
        `/api/v1/students/${id}/graduate`,
        {
          graduationYear,
          ...(override ? { override: true, overrideReason } : {}),
        },
        graduateStudentResponseSchema,
      );
    },
    onSuccess: () => {
      // Graduation moves the student from the active list to alumni (R62).
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

export function useDeleteStudent(): UseMutationResult<StudentDeletedResponse, Error, { id: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: ({ id }) => apiSend("delete", `/api/v1/students/${id}`, undefined, studentDeletedResponseSchema),
    onSuccess: (_data, { id }) => {
      // The detail now 404s — drop it rather than refetch it.
      queryClient.removeQueries({ queryKey: queryKeys.students.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.lists() });
    },
  });
}

/** A seat came or went: the students, and the season's count, roster and start check. */
function invalidateSeatChange(queryClient: QueryClient, seasonId: number): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.groups.roster(seasonId) });
}

/** PATCH /students/:id/enrollments/:seasonId → WITHDRAWN (Plan 7's endpoint). */
export function useDropEnrollment(): UseMutationResult<
  EnrollmentTransitionResponse,
  Error,
  { studentId: number; seasonId: number; dropReason: string | null }
> {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: ({ studentId, seasonId, dropReason }) =>
      apiSend(
        "patch",
        `/api/v1/students/${studentId}/enrollments/${seasonId}`,
        {
          status: "WITHDRAWN",
          dropReason,
        },
        enrollmentTransitionResponseSchema,
      ),
    onSuccess: (_data, { seasonId }) => invalidateSeatChange(queryClient, seasonId),
  });
}

/**
 * POST /students/:id/enrollments/:seasonId/restore (SUPER): a dropped seat comes back.
 * `override` adds the person past a program block the server named in its 409 `not_eligible`.
 */
export function useRestoreEnrollment(): UseMutationResult<
  unknown,
  Error,
  { studentId: number; seasonId: number; override?: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async ({ studentId, seasonId, override }) => {
      const res = await apiClient.post(
        `/api/v1/students/${studentId}/enrollments/${seasonId}/restore`,
        override ? { override: true } : {},
      );
      return res.data.data as unknown;
    },
    onSuccess: (_data, { seasonId }) => invalidateSeatChange(queryClient, seasonId),
  });
}

/**
 * POST /students/:id/invite: a Super, or an admin of a season the student is
 * in, resends the invite (owner, 2026-11-07). Metadata back, never a code.
 */
export function useResendStudentInvite(): UseMutationResult<InviteState, Error, { id: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => apiSend("post", `/api/v1/students/${id}/invite`, undefined, inviteStateSchema),
    // Settled: a refusal (already_activated) means the cached state is stale too.
    onSettled: (_data, _err, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
