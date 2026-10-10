import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createStudentResponseSchema,
  enrollmentTransitionResponseSchema,
  graduateStudentResponseSchema,
  studentDeletedResponseSchema,
  studentDetailInternalSchema,
  studentDetailPrivateSchema,
  studentDetailPublicSchema,
  studentAttendanceHistorySchema,
  studentListResponseSchema,
  studentSubmissionsSchema,
  updateStudentResponseSchema,
  type CreateStudentBody,
  type CreateStudentResponse,
  type EnrollmentTransitionResponse,
  type GraduateStudentResponse,
  type StudentDeletedResponse,
  type StudentDetailInternal,
  type StudentDetailPrivate,
  type StudentDetailPublic,
  type StudentAttendanceHistory,
  type StudentListResponse,
  type StudentListSort,
  type StudentListStatus,
  type StudentSubmissions,
  type UpdateStudentBody,
  type UpdateStudentResponse,
  type UserRole,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

/** The list's group filter and sort (REG-82); null leaves each to the server's default. */
export interface StudentListView {
  groupId: number | "none" | null;
  sort: StudentListSort | null;
  dir: "asc" | "desc";
}

export const DEFAULT_STUDENT_VIEW: StudentListView = { groupId: null, sort: null, dir: "asc" };

async function fetchStudentsPage(
  status: StudentListStatus,
  q: string,
  view: StudentListView,
  cursor: number | null,
): Promise<StudentListResponse> {
  const params = new URLSearchParams({ status });
  if (q) params.set("q", q);
  if (view.groupId !== null) params.set("groupId", String(view.groupId));
  if (view.sort !== null) {
    params.set("sort", view.sort);
    params.set("dir", view.dir);
  }
  if (cursor !== null) params.set("cursor", String(cursor));
  const res = await apiClient.get(`/api/v1/students?${params.toString()}`);
  return studentListResponseSchema.parse(res.data.data);
}

/**
 * Cursor-paginated student list. `enabled` is the role gate: the endpoint
 * 403s roles outside each surface, and the screen knows its allowed roles up
 * front — asking anyway would render an error state where a calm "not for
 * your role" empty state belongs.
 */
export function useStudentList(
  status: StudentListStatus,
  q: string,
  enabled: boolean,
  view: StudentListView = DEFAULT_STUDENT_VIEW,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.students.list(status, q, view),
    queryFn: ({ pageParam }) => fetchStudentsPage(status, q, view, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

export type StudentDetail = StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal;

/**
 * The endpoint returns a different shape per role (spec 06 §4.2). Parsing the
 * caller's OWN arm — whose profile is `.strict()` — means a server that leaks
 * a withheld field fails the parse at the client boundary instead of quietly
 * delivering personal data (D3). A union parse would accept the widest shape
 * and hide exactly that bug.
 */
function detailSchemaFor(role: UserRole) {
  if (role === "SUPER" || role === "ADMIN") return studentDetailInternalSchema;
  if (role === "STUDENT") return studentDetailPrivateSchema; // self view — never `notes`
  return studentDetailPublicSchema; // LEADER, MENTOR
}

/** `id`/`role` are null while the route param or session is unresolved. */
export function useStudentDetail(
  id: number | null,
  role: UserRole | null,
): UseQueryResult<StudentDetail> {
  return useQuery({
    queryKey: queryKeys.students.detail(id),
    queryFn: async () => {
      // `enabled` guarantees both are set when this runs; the guard keeps the
      // narrowing honest without a cast.
      if (role === null) throw new Error("useStudentDetail ran without a role");
      const res = await apiClient.get(`/api/v1/students/${id}`);
      return detailSchemaFor(role).parse(res.data.data);
    },
    enabled: id !== null && role !== null,
  });
}

/**
 * GET /students/:id/attendance — staff only (REG-83). `enabled` is the role
 * gate: a STUDENT viewing their own record is refused, so the screen must not ask.
 */
export function useStudentAttendanceHistory(
  id: number | null,
  enabled: boolean,
): UseQueryResult<StudentAttendanceHistory> {
  return useQuery({
    queryKey: queryKeys.students.attendance(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/students/${id}/attendance`);
      return studentAttendanceHistorySchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

/** GET /students/:id/submissions — staff only (REG-83); never a DRAFT. */
export function useStudentSubmissions(
  id: number | null,
  enabled: boolean,
): UseQueryResult<StudentSubmissions> {
  return useQuery({
    queryKey: queryKeys.students.submissions(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/students/${id}/submissions`);
      return studentSubmissionsSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

/** POST /students — the server mints and mails the invite (Plan 10 Decision 1). */
export function useCreateStudent(): UseMutationResult<CreateStudentResponse, Error, CreateStudentBody> {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (body) => {
      const res = await apiClient.post("/api/v1/students", body);
      return createStudentResponseSchema.parse(res.data.data);
    },
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
    mutationFn: async ({ id, body }) => {
      const res = await apiClient.patch(`/api/v1/students/${id}`, body);
      return updateStudentResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}

export function useGraduateStudent(): UseMutationResult<
  GraduateStudentResponse,
  Error,
  { id: number; graduationYear: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async ({ id, graduationYear }) => {
      const res = await apiClient.post(`/api/v1/students/${id}/graduate`, { graduationYear });
      return graduateStudentResponseSchema.parse(res.data.data);
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
    mutationFn: async ({ id }) => {
      const res = await apiClient.delete(`/api/v1/students/${id}`);
      return studentDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: (_data, { id }) => {
      // The detail now 404s — drop it rather than refetch it.
      queryClient.removeQueries({ queryKey: queryKeys.students.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.lists() });
    },
  });
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
    mutationFn: async ({ studentId, seasonId, dropReason }) => {
      const res = await apiClient.patch(`/api/v1/students/${studentId}/enrollments/${seasonId}`, {
        status: "WITHDRAWN",
        dropReason,
      });
      return enrollmentTransitionResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    },
  });
}
