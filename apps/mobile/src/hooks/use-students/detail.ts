import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  studentDetailInternalSchema,
  studentDetailPrivateSchema,
  studentDetailPublicSchema,
  studentAttendanceHistorySchema,
  type StudentDetailInternal,
  type StudentDetailPrivate,
  type StudentDetailPublic,
  type StudentAttendanceHistory,
  type UserRole,
} from "@space/shared";

import { apiClient } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";
import { useSessionStore } from "../../store/session";
import { apiGet } from "../../lib/api-request";

export type StudentDetail = StudentDetailPublic | StudentDetailPrivate | StudentDetailInternal;

/**
 * The endpoint returns a different shape per role (spec 06 §4.2). Parsing the
 * caller's OWN arm — whose profile is `.strict()` — means a server that leaks
 * a withheld field fails the parse at the client boundary instead of quietly
 * delivering personal data (D3). A union parse would accept the widest shape
 * and hide exactly that bug.
 */
function detailSchemaFor(role: UserRole, isSelf: boolean) {
  if (role === "SUPER") return studentDetailInternalSchema;
  // Self view, never `notes`: the server's rule for everyone but SUPER, who may be serving.
  if (role === "STUDENT" || isSelf) return studentDetailPrivateSchema;
  if (role === "ADMIN") return studentDetailInternalSchema;
  return studentDetailPublicSchema; // LEADER, MENTOR
}

/** `id`/`role` are null while the route param or session is unresolved. */
export function useStudentDetail(id: number | null, role: UserRole | null): UseQueryResult<StudentDetail> {
  const myId = useSessionStore((s) => s.user?.id ?? null);
  return useQuery({
    queryKey: queryKeys.students.detail(id),
    queryFn: async () => {
      // `enabled` guarantees both are set when this runs; the guard keeps the
      // narrowing honest without a cast.
      if (role === null) throw new Error("useStudentDetail ran without a role");
      const res = await apiClient.get(`/api/v1/students/${id}`);
      return detailSchemaFor(role, id === myId).parse(res.data.data);
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
    queryFn: () => apiGet(`/api/v1/students/${id}/attendance`, studentAttendanceHistorySchema),
    enabled: enabled && id !== null,
  });
}
