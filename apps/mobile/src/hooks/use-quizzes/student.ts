import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  saveQuizAnswersResponseSchema,
  studentQuizDetailSchema,
  studentQuizListPageSchema,
  type StudentQuizDetail,
  type StudentQuizResult,
  type QuizAnswerInput,
} from "@space/shared";

import { apiClient } from "../../lib/api-client";
import { DASHBOARD_META } from "../../lib/dashboard-invalidation";
import { queryKeys } from "../../lib/query-keys";

/**
 * Student list.
 *
 * GET /quizzes returns a different row shape per role, so each hook parses its
 * own arm rather than a union — a union parse would quietly accept the staff
 * shape and hide a role-routing bug. Same reasoning as Plan 1's
 * useStudentAssignments.
 */
export function useStudentQuizList(seasonId: number | null): UseQueryResult<StudentQuizResult[]> {
  return useQuery({
    queryKey: queryKeys.quizzes.studentBySeason(seasonId),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}`);
      return studentQuizListPageSchema.parse(res.data.data).items;
    },
    enabled: seasonId !== null,
  });
}

export function useStudentQuizDetail(id: number | null): UseQueryResult<StudentQuizDetail> {
  return useQuery({
    queryKey: queryKeys.quizzes.studentDetail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/** Idempotent create-or-resume (ruling C6). Safe to call from a button that double-fires. */
export function useStartAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.put(`/api/v1/quizzes/${id}/attempt`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.quizzes.studentDetail(id), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export type AnswerInput = QuizAnswerInput;

/** The cached student detail with these saved answers written into it. */
function mergeSavedAnswers(
  detail: StudentQuizDetail | undefined,
  answers: AnswerInput[],
): StudentQuizDetail | undefined {
  if (!detail) return detail;
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return {
    ...detail,
    questions: detail.questions.map((q) => {
      const a = byId.get(q.id);
      return a ? { ...q, selectedIndex: a.selectedIndex, text: a.text } : q;
    }),
  };
}

export function useSaveAnswers(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (answers: AnswerInput[]) => {
      const res = await apiClient.patch(`/api/v1/quizzes/${id}/attempt`, { answers });
      return saveQuizAnswersResponseSchema.parse(res.data.data);
    },
    // No invalidation — refetching mid-attempt would race the runner's local
    // draft — but the cached detail IS brought up to date with what the server
    // now holds. useStartAttempt seeds that cache with a blank attempt, and the
    // runner initialises its form from it, so without this a student who
    // leaves and re-opens the quiz inside staleTime sees their saved answers
    // as blank. Hook-level, so it still runs for a flush fired on unmount.
    onSuccess: (_result, answers) => {
      queryClient.setQueryData<StudentQuizDetail>(queryKeys.quizzes.studentDetail(id), (old) =>
        mergeSavedAnswers(old, answers),
      );
    },
  });
}

export function useSubmitAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    // Offline, fail now with the runner's message rather than hang and hand the
    // quiz in on reconnect. Unlike useSaveAnswers, whose autosave may wait.
    networkMode: "always",
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/attempt/submit`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.quizzes.studentDetail(id), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}
