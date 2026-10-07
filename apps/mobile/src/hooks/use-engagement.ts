import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import axios from "axios";
import { studentEngagementSchema, type StudentEngagement } from "@space/shared";

import { apiClient } from "../lib/api-client";
import { apiErrorCode } from "../lib/api-error";
import { queryKeys } from "../lib/query-keys";

/**
 * True only for the API's `404 no_season` — "this student has nothing to
 * score", a real answer. Every other failure (403, 500, offline) is an error
 * the screen must show as one, with a retry; an earlier draft rendered every
 * error as "No season to score yet".
 */
export function isNoSeasonError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  // Code read through the envelope schema (api-error.ts), not a cast.
  return err.response?.status === 404 && apiErrorCode(err) === "no_season";
}

/**
 * One student's engagement, staff arm.
 *
 * Parsed with the staff schema specifically. The student's own arm is a
 * different, narrower shape (no composite, no flag — spec D9), and a union
 * parse would quietly accept either and hide a role-routing bug.
 *
 * Nothing here recomputes anything. `score` and `atRisk` arrive derived
 * (ruling C4) because v1 defined "at risk" three different ways in three files
 * and the three disagreed (spec D7).
 */
export function useStudentEngagement(
  studentId: number | null,
  enabled: boolean,
): UseQueryResult<StudentEngagement> {
  return useQuery({
    queryKey: queryKeys.engagement.student(studentId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/students/${studentId}/engagement`);
      return studentEngagementSchema.parse(res.data.data);
    },
    enabled: enabled && studentId !== null,
    // A 404 means "no season to score", which is a real answer, not a
    // transient failure — retrying it three times just delays the message.
    retry: false,
  });
}
