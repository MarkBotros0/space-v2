import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  quizGradeSheetSchema,
  quizGradingAttemptSchema,
  quizGradingPageSchema,
  reopenAttemptResponseSchema,
  type QuizGradeSheet,
  type QuizGradingPage,
  type QuizGradeEntry,
} from "@space/shared";

import { apiClient } from "../../lib/api-client";
import { DASHBOARD_META } from "../../lib/dashboard-invalidation";
import { queryKeys } from "../../lib/query-keys";

export function useQuizGradeSheet(id: number | null, enabled: boolean): UseQueryResult<QuizGradeSheet> {
  return useQuery({
    queryKey: queryKeys.quizzes.grades(id),
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes/${id}/grades`);
      return quizGradeSheetSchema.parse(res.data.data);
    },
    enabled: enabled && id !== null,
  });
}

export type GradeEntryInput = QuizGradeEntry;

export function useSaveQuizGrades(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
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

/**
 * The online grading list, a page of students at a time (20 by default).
 *
 * The server pages over the STUDENT set, not the attempts: each page carries
 * that slice's submitted attempts in `items` and its unfinished students in
 * `waiting`, so both lists grow as pages load. Flatten with
 * `flattenGradingPages`.
 */
export function useQuizAttempts(
  id: number | null,
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<QuizGradingPage>> {
  return useInfiniteQuery({
    queryKey: queryKeys.quizzes.attempts(id),
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const after = pageParam === null ? "" : `?cursor=${pageParam}`;
      const res = await apiClient.get(`/api/v1/quizzes/${id}/attempts${after}`);
      return quizGradingPageSchema.parse(res.data.data);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: enabled && id !== null,
  });
}

/**
 * Every loaded page as one list. `waiting` is re-ordered so in-progress
 * students stay ahead of never-started ones across page boundaries, as they
 * are within a single page.
 */
export function flattenGradingPages(pages: QuizGradingPage[]): {
  items: QuizGradingPage["items"];
  waiting: QuizGradingPage["waiting"];
} {
  const waiting = pages.flatMap((p) => p.waiting);
  return {
    items: pages.flatMap((p) => p.items),
    waiting: [...waiting.filter((w) => w.startedAt !== null), ...waiting.filter((w) => w.startedAt === null)],
  };
}

export function useGradeEssays(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (input: { attemptId: number; awards: { questionId: number; points: number }[] }) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/attempts/${input.attemptId}/grade`, {
        awards: input.awards,
      });
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
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: async (studentUserId: number) => {
      const res = await apiClient.post(`/api/v1/quizzes/${id}/attempts/reopen`, {
        studentUserId,
      });
      return reopenAttemptResponseSchema.parse(res.data.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.attempts(id) });
      // A reopened attempt is no longer graded, so the lists' "2/2 graded" moves.
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}
