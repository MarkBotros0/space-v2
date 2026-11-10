import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { z } from "zod";
import {
  createVideoQuestionResponseSchema,
  isWatched,
  mergeIntervals,
  deleteVideoQuestionResponseSchema,
  studentVideoPartSchema,
  studentVideoQuizSchema,
  submitVideoAnswerResponseSchema,
  updateVideoQuestionResponseSchema,
  videoPartProgressResponseSchema,
  videoProgressResponseSchema,
  videoQuestionAdminSchema,
  videoQuizResultsSchema,
  type StudentVideoQuiz,
  type VideoQuestionAdmin,
  type VideoQuestionInput,
  type VideoQuizResults,
} from "@space/shared";

import { DASHBOARD_META } from "../lib/dashboard-invalidation";
import { queryKeys } from "../lib/query-keys";
import { apiGet, apiSend } from "../lib/api-request";

// A video with timed questions belongs to a session or to a VIDEO part of an
// assignment. The student's player data, progress and answers have their own
// paths per owner; editing and deleting a question are shared
// (/video-questions/:questionId).

/** Whose video the questions hang off. */
export type VideoOwner =
  { kind: "session"; sessionId: number } | { kind: "part"; assignmentId: number; partId: number };

const questionsPath = (owner: VideoOwner) =>
  owner.kind === "session"
    ? `/api/v1/sessions/${owner.sessionId}/video-questions`
    : `/api/v1/assignments/${owner.assignmentId}/parts/${owner.partId}/video-questions`;

export function useStudentVideoQuiz(sessionId: number | null, enabled: boolean): UseQueryResult<StudentVideoQuiz> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.forSession(sessionId ?? -1),
    // Parsing against the .strict() student schema is the client half of the
    // answer-key split: a backend that starts sending correctIndex fails
    // here rather than rendering the answer to the open question.
    queryFn: () => apiGet(`/api/v1/sessions/${sessionId}/video-quiz`, studentVideoQuizSchema),
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
        { furthestSeconds },
        videoProgressResponseSchema,
      ),
  });
}

type StudentVideoPart = z.infer<typeof studentVideoPartSchema>;

/** The student's player data for a video part: the questions (no answer key), the watching and the settings. */
export function usePartVideo(assignmentId: number | null, partId: number | null): UseQueryResult<StudentVideoPart> {
  return useQuery({
    queryKey: queryKeys.videoQuiz.part(assignmentId ?? -1, partId ?? -1),
    queryFn: () => apiGet(`/api/v1/assignments/${assignmentId}/parts/${partId}/video`, studentVideoPartSchema),
    enabled: assignmentId !== null && partId !== null,
  });
}

type Range = [number, number];

/** The schema's cap on ranges in one report; the rest wait for the next. */
const MAX_RANGES_PER_REPORT = 50;

/**
 * Reports the ranges that actually played on a video part. Built to be
 * called every ≤ 10 s while playing and on pause, leave or background:
 *
 * - `report(ranges, position)` never throws and never toasts; a failed
 *   report's ranges are kept and go out, merged, with the next one;
 * - one request at a time: ranges reported while one is in flight go out
 *   as soon as it settles (so a final report on leave is not lost);
 * - no cache writes on each report (the player holds the live numbers). Only
 *   when the part becomes watched or done do the assignment's rows refresh.
 */
export function useSavePartVideoProgress(assignmentId: number, partId: number) {
  const queryClient = useQueryClient();
  const pending = useRef<Range[]>([]);
  const position = useRef(0);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const lastState = useRef<string | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    const batch = pending.current.slice(0, MAX_RANGES_PER_REPORT);
    pending.current = pending.current.slice(MAX_RANGES_PER_REPORT);
    dirty.current = false;
    let saved;
    try {
      saved = await apiSend(
        "put",
        `/api/v1/assignments/${assignmentId}/parts/${partId}/video/progress`,
        { intervals: batch, position: position.current },
        videoPartProgressResponseSchema,
      );
    } catch {
      // Silent: keep the ranges for the next report, which is the retry.
      pending.current = mergeIntervals(batch, pending.current);
      return;
    }
    const state = `${isWatched(saved.watchedSeconds, saved.durationSeconds)}:${saved.completedAt !== null}`;
    if (state !== lastState.current && state !== "false:false") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    }
    lastState.current = state;
    if (dirty.current || pending.current.length > 0) await flush();
  }, [assignmentId, partId, queryClient]);

  const report = useCallback(
    async (ranges: Range[], at: number): Promise<void> => {
      pending.current = mergeIntervals(pending.current, ranges);
      position.current = at;
      dirty.current = true;
      // The running report sends what arrived meanwhile once it settles.
      if (inFlight.current !== null) return;
      inFlight.current = flush().finally(() => {
        inFlight.current = null;
      });
      await inFlight.current;
    },
    [flush],
  );

  return { report };
}

/**
 * A timed question answered on a video part. One answer per question is
 * final, and the last one can make the part done, so the assignment's rows
 * refresh with the player.
 */
export function useSubmitPartVideoAnswer(assignmentId: number, partId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    // Spec 19 D24: the last answer can finish the part, which Home counts.
    meta: DASHBOARD_META,
    mutationFn: (input: { questionId: number; selectedIndex: number }) =>
      apiSend(
        "post",
        `/api/v1/assignments/${assignmentId}/parts/${partId}/video/answers`,
        input,
        submitVideoAnswerResponseSchema,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.videoQuiz.part(assignmentId, partId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.lists() });
    },
  });
}

const adminListSchema = z.object({ questions: z.array(videoQuestionAdminSchema) });

const questionsKey = (owner: VideoOwner) =>
  owner.kind === "session"
    ? queryKeys.videoQuiz.questions(owner.sessionId)
    : queryKeys.videoQuiz.partQuestions(owner.assignmentId, owner.partId);

/** The author's question list, with the answer key. `owner` is null until the screen knows it. */
export function useVideoQuestions(owner: VideoOwner | null, enabled: boolean): UseQueryResult<VideoQuestionAdmin[]> {
  return useQuery({
    queryKey: owner === null ? [...queryKeys.videoQuiz.all, "admin", null] : questionsKey(owner),
    queryFn: async () => (await apiGet(questionsPath(owner as VideoOwner), adminListSchema)).questions,
    // `enabled` is the gate that keeps a student screen from ever issuing the
    // read that carries the answer key. Never call this hook unconditionally.
    enabled: enabled && owner !== null,
  });
}

export function useVideoQuestionWrites(owner: VideoOwner) {
  const queryClient = useQueryClient();
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.videoQuiz.all });
    // A question added to or removed from a part changes whether students' video is done.
    if (owner.kind === "part") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(owner.assignmentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.progress(owner.assignmentId) });
    }
  };

  const create = useMutation({
    mutationFn: (input: VideoQuestionInput) =>
      apiSend("post", questionsPath(owner), input, createVideoQuestionResponseSchema),
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
