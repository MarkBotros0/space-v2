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
  endAttemptResponseSchema,
  quizGradeSheetSchema,
  quizGradingAttemptSchema,
  quizGradingPageSchema,
  reopenAttemptResponseSchema,
  type QuizGradeSheet,
  type QuizGradingPage,
  type MarkAttemptInput,
  type QuizGradeEntry,
} from "@space/shared";

import { DASHBOARD_META } from "../../lib/dashboard-invalidation";
import { queryKeys } from "../../lib/query-keys";
import { apiGet, apiSend } from "../../lib/api-request";

export function useQuizGradeSheet(id: number | null, enabled: boolean): UseQueryResult<QuizGradeSheet> {
  return useQuery({
    queryKey: queryKeys.quizzes.grades(id),
    queryFn: () => apiGet(`/api/v1/quizzes/${id}/grades`, quizGradeSheetSchema),
    enabled: enabled && id !== null,
  });
}

export type GradeEntryInput = QuizGradeEntry;

export function useSaveQuizGrades(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (entries: GradeEntryInput[]) =>
      apiSend("post", `/api/v1/quizzes/${id}/grades`, { entries }, quizGradeSheetSchema),
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
      return apiGet(`/api/v1/quizzes/${id}/attempts${after}`, quizGradingPageSchema);
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

/** The leader's right/wrong marks for one attempt (fill-in-the-blank blanks and essays). */
export function useMarkAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (input: { attemptId: number } & MarkAttemptInput) =>
      apiSend(
        "post",
        `/api/v1/quizzes/${id}/attempts/${input.attemptId}/grade`,
        { marks: input.marks } satisfies MarkAttemptInput,
        quizGradingAttemptSchema,
      ),
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
    mutationFn: (studentUserId: number) =>
      apiSend(
        "post",
        `/api/v1/quizzes/${id}/attempts/reopen`,
        {
          studentUserId,
        },
        reopenAttemptResponseSchema,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.attempts(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.live(id) });
      // A reopened attempt is no longer graded, so the lists' "2/2 graded" moves.
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

/**
 * Staff End: closes a student's open attempt and submits what is saved (endReason ENDED_BY_STAFF,
 * docs/rules/quiz-integrity.md "Timing"). Refreshes on a refusal too: `attempt_closed` means the
 * list is out of date (the student submitted, or the scheduler timed it out). An attempt past its
 * deadline that End itself closes answers 200, closed TIMED_OUT.
 */
export function useEndAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: this write moves a number on some role's Home.
    meta: DASHBOARD_META,
    mutationFn: (studentUserId: number) =>
      apiSend("post", `/api/v1/quizzes/${id}/attempts/end`, { studentUserId }, endAttemptResponseSchema),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.attempts(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.live(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}
