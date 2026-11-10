import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  assignmentDetailSchema,
  assignmentProgressSchema,
  staffAssignmentListItemSchema,
  studentAssignmentListItemSchema,
  type AssignmentDetail,
  type AssignmentProgress,
  type StaffAssignmentListItem,
  type StudentAssignmentListItem,
} from "@space/shared";

import { queryKeys } from "../lib/query-keys";
import { apiGet } from "../lib/api-request";

// GET /seasons/:id/assignments returns a different row shape per role. Each
// hook parses its own role's arm specifically: a union parse would quietly
// accept the other role's rows and hide a role-routing bug.
const studentListSchema = z.object({ assignments: z.array(studentAssignmentListItemSchema) });
const staffListSchema = z.object({ assignments: z.array(staffAssignmentListItemSchema) });

/** Dependent query — same nullable-season contract as useSeasonSessions. */
export function useStudentAssignments(seasonId: number | null): UseQueryResult<StudentAssignmentListItem[]> {
  return useQuery({
    queryKey: queryKeys.assignments.bySeason(seasonId),
    queryFn: async () => (await apiGet(`/api/v1/seasons/${seasonId}/assignments`, studentListSchema)).assignments,
    enabled: seasonId !== null,
  });
}

/** The staff arm of GET /seasons/:id/assignments. */
export function useStaffAssignments(seasonId: number | null): UseQueryResult<StaffAssignmentListItem[]> {
  return useQuery({
    queryKey: queryKeys.assignments.staffBySeason(seasonId),
    queryFn: async () => (await apiGet(`/api/v1/seasons/${seasonId}/assignments`, staffListSchema)).assignments,
    enabled: seasonId !== null,
  });
}

/** The assignment, its parts in order, and (for a student) their work on each. `id` is null while the route param is unparsed. */
export function useAssignmentDetail(id: number | null): UseQueryResult<AssignmentDetail> {
  return useQuery({
    queryKey: queryKeys.assignments.detail(id),
    queryFn: () => apiGet(`/api/v1/assignments/${id}`, assignmentDetailSchema),
    enabled: id !== null,
  });
}

/** GET /assignments/:id/progress — season admins see every student, a leader their own groups'. */
export function useAssignmentProgress(id: number | null): UseQueryResult<AssignmentProgress> {
  return useQuery({
    queryKey: queryKeys.assignments.progress(id),
    queryFn: () => apiGet(`/api/v1/assignments/${id}/progress`, assignmentProgressSchema),
    enabled: id !== null,
  });
}
