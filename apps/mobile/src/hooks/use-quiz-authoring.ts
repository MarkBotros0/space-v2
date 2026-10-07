import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  publishQuizResponseSchema,
  quizCreatedResponseSchema,
  quizQuestionAuthoringSchema,
  quizQuestionDeletedResponseSchema,
  quizUpdatedResponseSchema,
  reorderQuestionsResponseSchema,
  type createQuizRequestSchema,
  type QuizQuestionInput,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

/** What the create form sends — the request schema's input side. */
export type CreateQuizInput = z.input<typeof createQuizRequestSchema>;

/**
 * Every builder write invalidates the quiz's own detail (whose staff entry
 * holds the questions and canEditStructure) and the lists (questionCount,
 * maxScore and the draft badge all change).
 */
function useInvalidateQuiz(id: number | null) {
  const queryClient = useQueryClient();
  return () => {
    if (id !== null) void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.detail(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
  };
}

export function useCreateQuiz() {
  const invalidate = useInvalidateQuiz(null);
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (body: CreateQuizInput) => {
      const res = await apiClient.post("/api/v1/quizzes", body);
      return quizCreatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateQuiz(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (body: { title?: string; maxScore?: number }) => {
      const res = await apiClient.patch(`/api/v1/quizzes/${id}`, body);
      return quizUpdatedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useAddQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (body: QuizQuestionInput) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/questions`, body);
      return quizQuestionAuthoringSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (input: { questionId: number; body: QuizQuestionInput }) => {
      const res = await apiClient.patch(`/api/v1/quizzes/${id}/questions/${input.questionId}`, input.body);
      return quizQuestionAuthoringSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteQuestion(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (questionId: number) => {
      const res = await apiClient.delete(`/api/v1/quizzes/${id}/questions/${questionId}`);
      return quizQuestionDeletedResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

/** Sends the FULL permutation — the server refuses anything else (`invalid_order`). */
export function useReorderQuestions(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    mutationFn: async (questionIds: number[]) => {
      const res = await apiClient.put(`/api/v1/quizzes/${id}/questions/order`, { questionIds });
      return reorderQuestionsResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}

export function usePublishQuiz(id: number) {
  const invalidate = useInvalidateQuiz(id);
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (publish: boolean) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/publish`, { publish });
      return publishQuizResponseSchema.parse(res.data.data);
    },
    onSuccess: invalidate,
  });
}
