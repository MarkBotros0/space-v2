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
import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";

/** The API's largest staff-list page (quizListQuerySchema caps `limit` at 100). */
const QUIZ_LIST_PAGE = 100;
/** A runaway-cursor backstop: 50 pages of 100 is far past any real season. */
const QUIZ_LIST_MAX_PAGES = 50;

/**
 * Staff list — EVERY page, following nextCursor. Parses the staff arm
 * specifically — see the student hook below.
 *
 * The server pages by id while the screens sort by session date (v1's order),
 * and v1 showed the whole season. A "Load more" over id-ordered pages would
 * reshuffle rows the reader already saw, so the hook walks the cursor and
 * returns one page holding everything, with `nextCursor: null`.
 */
export function useQuizList(seasonId: number | null): UseQueryResult<QuizListPage> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.bySeason(seasonId), "staff"] as const,
    queryFn: async () => {
      const items: QuizListPage["items"] = [];
      let cursor: number | null = null;
      for (let i = 0; i < QUIZ_LIST_MAX_PAGES; i++) {
        const after: string = cursor === null ? "" : `&cursor=${cursor}`;
        const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}&limit=${QUIZ_LIST_PAGE}${after}`);
        const page = quizListPageSchema.parse(res.data.data);
        items.push(...page.items);
        cursor = page.nextCursor;
        if (cursor === null) break;
      }
      return { items, nextCursor: null };
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
export function useStudentQuizList(seasonId: number | null): UseQueryResult<StudentQuizResult[]> {
  return useQuery({
    queryKey: [...queryKeys.quizzes.bySeason(seasonId), "student"] as const,
    queryFn: async () => {
      const res = await apiClient.get(`/api/v1/quizzes?seasonId=${seasonId}`);
      return studentQuizListPageSchema.parse(res.data.data).items;
    },
    enabled: seasonId !== null,
  });
}

export function useStudentQuizDetail(id: number | null): UseQueryResult<StudentQuizDetail> {
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
export function useQuizAuthoringDetail(id: number | null, enabled: boolean): UseQueryResult<QuizAuthoringDetail> {
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
      queryClient.setQueryData<StudentQuizDetail>([...queryKeys.quizzes.detail(id), "student"], (old) =>
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
      queryClient.setQueryData([...queryKeys.quizzes.detail(id), "student"], detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

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

export interface GradeEntryInput {
  studentUserId: number;
  score: number | null;
  notes: string | null;
}

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
