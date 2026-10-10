import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  assignmentDetailSchema,
  assignmentTrackerSchema,
  staffAssignmentListItemSchema,
  studentAssignmentListItemSchema,
  type AssignmentDetail,
  type AssignmentTracker,
  type StaffAssignmentListItem,
  type StudentAssignmentListItem,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

const studentListSchema = z.array(studentAssignmentListItemSchema);

async function fetchStudentAssignments(seasonId: number): Promise<StudentAssignmentListItem[]> {
  const res = await apiClient.get(`/api/v1/seasons/${seasonId}/assignments`);
  // The endpoint returns a different row shape per role; this hook is the
  // student's, so it parses the student arm specifically — a union parse
  // would quietly accept the staff shape and hide a role-routing bug.
  return studentListSchema.parse(res.data.data.assignments);
}

/** Dependent query — same nullable-season contract as useSeasonSessions. */
export function useStudentAssignments(
  seasonId: number | null,
): UseQueryResult<StudentAssignmentListItem[]> {
  return useQuery({
    queryKey: queryKeys.assignments.bySeason(seasonId),
    queryFn: () => fetchStudentAssignments(seasonId as number),
    enabled: seasonId !== null,
  });
}

async function fetchAssignmentDetail(id: number): Promise<AssignmentDetail> {
  const res = await apiClient.get(`/api/v1/assignments/${id}`);
  return assignmentDetailSchema.parse(res.data.data);
}

/** `id` is null while the route param is unparsed or invalid. */
export function useAssignmentDetail(id: number | null): UseQueryResult<AssignmentDetail> {
  return useQuery({
    queryKey: queryKeys.assignments.detail(id),
    queryFn: () => fetchAssignmentDetail(id as number),
    enabled: id !== null,
  });
}

const staffListSchema = z.array(staffAssignmentListItemSchema);

/**
 * The staff arm of GET /seasons/:id/assignments. Parsed against the staff
 * schema specifically — the same reasoning as fetchStudentAssignments: a union
 * parse would accept the wrong role's rows and hide a routing bug.
 */
export function useStaffAssignments(
  seasonId: number | null,
): UseQueryResult<StaffAssignmentListItem[]> {
  return useQuery({
    queryKey: queryKeys.assignments.staffBySeason(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/seasons/${seasonId}/assignments`);
      return staffListSchema.parse(res.data.data.assignments);
    },
    enabled: seasonId !== null,
  });
}

/** GET /assignments/:id/tracker — season admins see everyone, a leader their own groups. */
export function useAssignmentTracker(id: number | null): UseQueryResult<AssignmentTracker> {
  return useQuery({
    queryKey: queryKeys.assignments.tracker(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/assignments/${id}/tracker`);
      return assignmentTrackerSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}
