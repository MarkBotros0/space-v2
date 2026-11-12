import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  passCriteriaSchema,
  passingOutlookSchema,
  studentProgressSchema,
  type PassCriteria,
  type PassingOutlook,
  type StudentProgress,
} from "@space/shared";
import { z } from "zod";

import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

/**
 * A student's season progress, for staff (`GET /students/:id/progress`): the three numbers, their
 * assignments and their quizzes. The season is the one engagement scores; a 404 `no_season` is a
 * real answer (read it with `isNoSeasonError`), so it is not retried. A mentor or the student
 * themself gets 403: pass null for them and nothing is asked.
 */
export function useStudentProgress(studentId: number | null): UseQueryResult<StudentProgress> {
  return useQuery({
    queryKey: queryKeys.passing.student(studentId),
    queryFn: () => apiGet(`/api/v1/students/${studentId}/progress`, studentProgressSchema),
    enabled: studentId !== null,
    retry: false,
  });
}

/**
 * The season's passing outlook (`GET /seasons/:id/passing`): the criteria and every student the
 * caller may see with their score, below the mark first. Admin and super see the season, a leader
 * their own groups'. Pass null until the season is known.
 */
export function usePassingOutlook(seasonId: number | null): UseQueryResult<PassingOutlook> {
  return useQuery({
    queryKey: queryKeys.passing.outlook(seasonId),
    queryFn: () => apiGet(`/api/v1/seasons/${seasonId}/passing`, passingOutlookSchema),
    enabled: seasonId !== null,
  });
}

const savedCriteriaSchema = z.object({ criteria: passCriteriaSchema });

/**
 * Save the season's pass criteria (`PUT /seasons/:id/pass-criteria`; the season's admin or a super,
 * ACTIVE only). Every score moves with them, so the outlook reloads, and so does End's check.
 */
export function useSavePassCriteria(seasonId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (criteria: PassCriteria) =>
      apiSend("put", `/api/v1/seasons/${seasonId}/pass-criteria`, criteria, savedCriteriaSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.passing.outlook(seasonId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.seasons.endCheck(seasonId) });
    },
  });
}
