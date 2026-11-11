import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  publishQuizResponseSchema,
  quizCreatedResponseSchema,
  quizQuestionAuthoringSchema,
  quizQuestionDeletedResponseSchema,
  quizUpdatedResponseSchema,
  releaseQuizResultsResponseSchema,
  reorderQuestionsResponseSchema,
  type createQuizRequestSchema,
  type QuizQuestionInput,
} from "@space/shared";

import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";
import { apiSend } from "../lib/api-request";

/** What the create form sends — the request schema's input side. */
export type CreateQuizInput = z.input<typeof createQuizRequestSchema>;

/**
 * Every builder write invalidates the quiz's own detail (whose staff entry
 * holds the questions and canEditStructure) and the lists (questionCount,
 * maxScore and the draft badge all change), and every session's quiz card,
 * which shows the same title, question count, max score and draft badge. A
 * create or edit only names the quiz, not the session it hangs off, so all of
 * them are invalidated — only the ones mounted actually refetch.
 */
function useInvalidateQuiz(id: number | null) {
  const queryClient = useQueryClient();
  return () => {
    if (id !== null) void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.detail(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.allQuizzes() });
  };
}

export function useCreateQuiz() {
  const invalidate = useInvalidateQuiz(null);
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (body: CreateQuizInput) => apiSend("post", "/api/v1/quizzes", body, quizCreatedResponseSchema),
    onSuccess: invalidate,
  });
}

export function useUpdateQuiz(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: (body: { title?: string; maxScore?: number; shuffleQuestions?: boolean }) =>
      apiSend("patch", `/api/v1/quizzes/${id}`, body, quizUpdatedResponseSchema),
    onSuccess: invalidate,
  });
}

export function useAddQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: (body: QuizQuestionInput) =>
      apiSend("post", `/api/v1/quizzes/${id}/questions`, body, quizQuestionAuthoringSchema),
    onSuccess: invalidate,
  });
}

export function useUpdateQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: (input: { questionId: number; body: QuizQuestionInput }) =>
      apiSend("patch", `/api/v1/quizzes/${id}/questions/${input.questionId}`, input.body, quizQuestionAuthoringSchema),
    onSuccess: invalidate,
  });
}

export function useDeleteQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: (questionId: number) =>
      apiSend("delete", `/api/v1/quizzes/${id}/questions/${questionId}`, undefined, quizQuestionDeletedResponseSchema),
    onSuccess: invalidate,
  });
}

/** Sends the FULL permutation — the server refuses anything else (`invalid_order`). */
export function useReorderQuestions(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: (questionIds: number[]) =>
      apiSend("put", `/api/v1/quizzes/${id}/questions/order`, { questionIds }, reorderQuestionsResponseSchema),
    onSuccess: invalidate,
  });
}

export function usePublishQuiz(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (publish: boolean) =>
      apiSend("post", `/api/v1/quizzes/${id}/publish`, { publish }, publishQuizResponseSchema),
    onSuccess: invalidate,
  });
}

/**
 * Lets the quiz's students see their scores and which answers were right
 * (owner, 2026-11-07). The season's admin or a super only; one way.
 */
export function useReleaseQuizResults(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    meta: DASHBOARD_META,
    mutationFn: () => apiSend("post", `/api/v1/quizzes/${id}/release`, undefined, releaseQuizResultsResponseSchema),
    onSuccess: invalidate,
  });
}
