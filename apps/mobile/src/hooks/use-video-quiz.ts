import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";
import {
  createVideoQuestionResponseSchema,
  deleteVideoQuestionResponseSchema,
  studentVideoQuizSchema,
  submitVideoAnswerResponseSchema,
  updateVideoQuestionResponseSchema,
  videoProgressResponseSchema,
  videoQuestionAdminSchema,
  videoQuizResultsSchema,
  type StudentVideoQuiz,
  type VideoQuestionAdmin,
  type VideoQuestionInput,
  type VideoQuizResults,
} from "@space/shared";

import { apiClient } from "../lib/api-client";
import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

const adminListSchema = z.array(videoQuestionAdminSchema);

export function useStudentVideoQuiz(sessionId: number | null, enabled: boolean): UseQueryResult<StudentVideoQuiz> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.forSession(sessionId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/video-quiz`);
      // Parsing against the .strict() student schema is the client half of the
      // answer-key split: a backend that starts sending correctIndex fails
      // here rather than rendering the answer to the open question.
      return studentVideoQuizSchema.parse(res.data.data);
    },
    enabled: enabled && sessionId !== null,
  });
}

export function useSubmitVideoAnswer(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { questionId: number; selectedIndex: number }) =>
      apiSend("post", `/api/v1/sessions/${sessionId}/video-quiz/answers`, input, submitVideoAnswerResponseSchema),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.videoQuiz.forSession(sessionId) }),
  });
}

/**
 * Progress is fire-and-forget on purpose: it is advisory (the server derives
 * completion and gates ordering on the answer set, not on this value), so a
 * failed save must never interrupt playback. No invalidation either — the value
 * this screen holds is always at least as fresh as the server's.
 */
export function useSaveVideoProgress(sessionId: number) {
  return useMutation({
    mutationFn: (furthestSeconds: number) =>
      apiSend(
        "put",
        `/api/v1/sessions/${sessionId}/video-quiz/progress`,
        {
          furthestSeconds,
        },
        videoProgressResponseSchema,
      ),
  });
}

export function useVideoQuestions(sessionId: number | null, enabled: boolean): UseQueryResult<VideoQuestionAdmin[]> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.questions(sessionId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/sessions/${sessionId}/video-questions`);
      return adminListSchema.parse(res.data.data.questions);
    },
    // `enabled` is the gate that keeps a student screen from ever issuing the
    // read that carries the answer key. Never call this hook unconditionally.
    enabled: enabled && sessionId !== null,
  });
}

export function useVideoQuestionWrites(sessionId: number) {
  const queryClient = useQueryClient();
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.videoQuiz.all });
  };

  const create = useMutation({
    mutationFn: (input: VideoQuestionInput) =>
      apiSend("post", `/api/v1/sessions/${sessionId}/video-questions`, input, createVideoQuestionResponseSchema),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (vars: { questionId: number; input: VideoQuestionInput }) =>
      apiSend("patch", `/api/v1/video-questions/${vars.questionId}`, vars.input, updateVideoQuestionResponseSchema),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (questionId: number) =>
      apiSend("delete", `/api/v1/video-questions/${questionId}`, undefined, deleteVideoQuestionResponseSchema),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export function useVideoQuizResults(sessionId: number | null, enabled: boolean): UseQueryResult<VideoQuizResults> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.results(sessionId ?? -1),
    queryFn: () => apiGet(`/api/v1/sessions/${sessionId}/video-quiz/results`, videoQuizResultsSchema),
    enabled: enabled && sessionId !== null,
  });
}
