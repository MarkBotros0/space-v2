import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { studentProgressSchema, type StudentProgress } from "@space/shared";

import { queryKeys } from "../lib/query-keys";
import { apiGet } from "../lib/api-request";

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
