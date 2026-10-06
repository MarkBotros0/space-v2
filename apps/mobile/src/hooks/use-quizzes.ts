import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  quizAuthoringDetailSchema,
  quizGradeSheetSchema,
  quizGradingAttemptSchema,
  quizGradingPageSchema,
  quizListPageSchema,
  reopenAttemptResponseSchema,
  saveQuizAnswersResponseSchema,
  studentQuizDetailSchema,
  studentQuizListPageSchema,
  type QuizAuthoringDetail,
  type QuizGradeSheet,
  type QuizGradingPage,
  type QuizListPage,
  type StudentQuizDetail,
  type StudentQuizResult,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";

/** Staff list. Parses the staff arm specifically — see the student hook below. */
export function useQuizList(seasonId: number | null): UseQueryResult<QuizListPage> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.bySeason(seasonId), "staff"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}`);
      return quizListPageSchema.parse(res.data.data);
    },
    enabled: seasonId !== null,
  });
}

/**
 * Student list.
 *
 * GET /quizzes returns a different row shape per role, so each hook parses its
 * own arm rather than a union — a union parse would quietly accept the staff
 * shape and hide a role-routing bug. Same reasoning as Plan 1's
 * useStudentAssignments.
 */
export function useStudentQuizList(
  seasonId: number | null,
): UseQueryResult<StudentQuizResult[]> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.bySeason(seasonId), "student"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}`);
      return studentQuizListPageSchema.parse(res.data.data).items;
    },
    enabled: seasonId !== null,
  });
}

export function useStudentQuizDetail(
  id: number | null,
): UseQueryResult<StudentQuizDetail> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.detail(id), "student"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    enabled: id !== null,
  });
}

/**
 * Staff detail — the authoring/grading shape, WITH the answer key.
 *
 * A separate hook from useStudentQuizDetail even though the URL is the same,
 * because the schemas are different types and the role decides which one the
 * server sends. Never call both from one screen.
 */
export function useQuizAuthoringDetail(
  id: number | null,
  enabled: boolean,
): UseQueryResult<QuizAuthoringDetail> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.detail(id), "staff"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}`);
      return quizAuthoringDetailSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
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
      queryClient.setQueryData([...queryKeys.quizzes.detail(id), "student"], detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export interface AnswerInput {
  questionId: number;
  selectedIndex: number | null;
  text: string | null;
}

export function useSaveAnswers(id: number) {
  return useMutation({
    mutationFn: async (answers: AnswerInput[]) => {
      const res = await apiClient.patch(`/api/v1/quizzes/${id}/attempt`, { answers });
      return saveQuizAnswersResponseSchema.parse(res.data.data);
    },
    // Deliberately no invalidation: the runner holds the authoritative draft in
    // local state while the student is typing, and refetching mid-attempt would
    // overwrite an unflushed edit with the server's older copy.
  });
}

export function useSubmitAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/attempt/submit`);
      return studentQuizDetailSchema.parse(res.data.data);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData([...queryKeys.quizzes.detail(id), "student"], detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export function useQuizGradeSheet(
  id: number | null,
  enabled: boolean,
): UseQueryResult<QuizGradeSheet> {
  return useQuery({
    queryKey: queryKeys.quizzes.grades(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}/grades`);
      return quizGradeSheetSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

export interface GradeEntryInput {
  studentUserId: number;
  score: number | null;
  notes: string | null;
}

export function useSaveQuizGrades(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: GradeEntryInput[]) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/grades`, { entries });
      return quizGradeSheetSchema.parse(res.data.data);
    },
    onSuccess: (sheet) => {
      queryClient.setQueryData(queryKeys.quizzes.grades(id), sheet);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export function useQuizAttempts(
  id: number | null,
  enabled: boolean,
): UseQueryResult<QuizGradingPage> {
  return useQuery({
    queryKey: queryKeys.quizzes.attempts(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}/attempts`);
      return quizGradingPageSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

export function useGradeEssays(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      attemptId: number;
      awards: { questionId: number; points: number }[];
    }) => {
      const res = await apiClient.post(
        `/api/v1/quizzes/${id}/attempts/${input.attemptId}/grade`,
        { awards: input.awards },
      );
      return quizGradingAttemptSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.attempts(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export function useReopenAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentUserId: number) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/attempts/reopen`, {
        studentUserId,
      });
      return reopenAttemptResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.attempts(id) });
    },
  });
}
