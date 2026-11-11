import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  openQuizAttemptSchema,
  quizAttemptEventsResponseSchema,
  saveQuizAnswersResponseSchema,
  studentQuizDetailSchema,
  studentQuizListPageSchema,
  type OpenQuizAttempt,
  type StudentQuizDetail,
  type StudentQuizResult,
  type QuizAnswerInput,
  type QuizAttemptEventInput,
} from "@space/shared";

import { apiClient } from "../../lib/api-client";
import { apiErrorCode } from "../../lib/api-error";
import { DASHBOARD_META } from "../../lib/dashboard-invalidation";
import { queryKeys } from "../../lib/query-keys";
import { apiGet, apiSend } from "../../lib/api-request";
import { useQuizLockStore } from "../../store/quiz-lock";

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
    queryFn: () => apiGet(`/api/v1/quizzes/${id}`, studentQuizDetailSchema),
    enabled: id !== null,
  });
}

/**
 * The student's open attempt, as the server sees it after its lazy close (spec "Relaunch"). Its
 * answer sets the quiz lock: a quiz id holds the student on that quiz, null releases them. A failed
 * read (offline at launch) leaves the last known lock in place, so airplane mode is no way out.
 */
export function useOpenQuizAttempt(enabled: boolean): UseQueryResult<OpenQuizAttempt> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.quizzes.openAttempt(),
    queryFn: async () => {
      const open = await apiGet("/api/v1/me/open-quiz-attempt", openQuizAttemptSchema);
      const { lockedQuizId, setLockedQuiz } = useQuizLockStore.getState();
      // Closed elsewhere (staff End, the scheduler): the held quiz's own read moves its screen on.
      if (lockedQuizId !== null && lockedQuizId !== open.quizId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.studentDetail(lockedQuizId) });
      }
      setLockedQuiz(open.quizId);
      return open;
    },
    enabled,
  });
}

/** Idempotent create-or-resume (ruling C6). Safe to call from a button that double-fires. */
export function useStartAttempt(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend("put", `/api/v1/quizzes/${id}/attempt`, undefined, studentQuizDetailSchema),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.quizzes.studentDetail(id), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}

export type AnswerInput = QuizAnswerInput;

/**
 * A save or submit refused because the attempt is no longer the one the form shows: closed elsewhere
 * (staff End, or the server's clock ran out before the phone's), or a reopened timed attempt not
 * started yet. No retry can change that.
 */
export function isAttemptGone(err: unknown): boolean {
  const code = apiErrorCode(err);
  return code === "attempt_closed" || code === "attempt_not_started";
}

/** Re-read the quiz so the runner shows where the attempt really is: the result, or the start card. */
function refreshOnGone(queryClient: ReturnType<typeof useQueryClient>, id: number, err: unknown) {
  if (!isAttemptGone(err)) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.studentDetail(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
}

/** The `answer` a saved input leaves on a question of the same type; undefined if the shapes disagree. */
function savedAnswer(q: StudentQuizDetail["questions"][number], a: AnswerInput): DraftAnswerShape | undefined {
  switch (a.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE":
      return q.type === "SINGLE_CHOICE" || q.type === "TRUE_FALSE" ? { optionId: a.optionId } : undefined;
    case "MULTI_CHOICE":
      return q.type === "MULTI_CHOICE" ? { optionIds: a.optionIds } : undefined;
    case "MATCHING":
      return q.type === "MATCHING" ? { pairs: a.pairs } : undefined;
    case "FILL_BLANK":
      return q.type === "FILL_BLANK" ? { blanks: a.blanks } : undefined;
    case "ESSAY":
      return q.type === "ESSAY" ? { text: a.text } : undefined;
  }
}

type DraftAnswerShape = StudentQuizDetail["questions"][number]["answer"];

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
      const answer = a ? savedAnswer(q, a) : undefined;
      return answer ? ({ ...q, answer } as typeof q) : q;
    }),
  };
}

export function useSaveAnswers(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: AnswerInput[]) =>
      apiSend("patch", `/api/v1/quizzes/${id}/attempt`, { answers }, saveQuizAnswersResponseSchema),
    // No invalidation — refetching mid-attempt would race the runner's local
    // draft — but the cached detail IS brought up to date with what the server
    // now holds. useStartAttempt seeds that cache with a blank attempt, and the
    // runner initialises its form from it, so without this a student who
    // leaves and re-opens the quiz inside staleTime sees their saved answers
    // as blank. Hook-level, so it still runs for a flush fired on unmount.
    onSuccess: (_result, answers) => {
      const key = queryKeys.quizzes.studentDetail(id);
      // Keep the cached read's time: the countdown's clock offset pairs `serverNow` with it, and
      // this merge brings no new `serverNow`.
      const updatedAt = queryClient.getQueryState(key)?.dataUpdatedAt;
      queryClient.setQueryData<StudentQuizDetail>(key, (old) => mergeSavedAnswers(old, answers), { updatedAt });
    },
    onError: (err) => refreshOnGone(queryClient, id, err),
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
    mutationFn: () => apiSend("post", `/api/v1/quizzes/${id}/attempt/submit`, undefined, studentQuizDetailSchema),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.quizzes.studentDetail(id), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
    onError: (err) => refreshOnGone(queryClient, id, err),
  });
}

/**
 * Report what the phone saw while the attempt was open (exits, relaunches, screenshots). The server
 * counts the exits; when this report ended the attempt, or it was already shut, the quiz is re-read
 * so the runner moves to the result. Offline it fails at once: the events wait in the exit queue.
 */
export function usePostAttemptEvents(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (body: { attemptId: number; events: QuizAttemptEventInput[] }) =>
      apiSend("post", `/api/v1/quizzes/${id}/attempt/events`, body, quizAttemptEventsResponseSchema),
    onSuccess: (report) => {
      if (!report.ended && report.status === "IN_PROGRESS") return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.studentDetail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes.lists() });
    },
  });
}
