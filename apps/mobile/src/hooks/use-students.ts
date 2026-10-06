import { useInfiniteQuery, useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  studentDetailInternalSchema,
  studentDetailPrivateSchema,
  studentDetailPublicSchema,
  studentListResponseSchema,
  type StudentDetailInternal,
  type StudentDetailPrivate,
  type StudentDetailPublic,
  type StudentListResponse,
  type StudentListStatus,
  type UserRole,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

async function fetchStudentsPage(
  status: StudentListStatus,
  q: string,
  cursor: number | null,
): Promise<StudentListResponse> {
  const params = new URLSearchParams({ status });
  if (q) params.set("q", q);
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
export function useStudentList(status: StudentListStatus, q: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.students.list(status, q),
    queryFn: ({ pageParam }) => fetchStudentsPage(status, q, pageParam),
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
