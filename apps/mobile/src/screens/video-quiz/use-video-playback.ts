/**
 * The core both video players share (a session's video and an assignment's
 * video part): the playhead poll, the question barrier, resuming where the
 * student got to, clamped seeking and the question sheet's state. What each
 * player does with the playhead (save the furthest point, count the watched
 * ranges) stays in the player, through `onPoll` and `onStop`.
 */
import type { UseMutationResult } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { YoutubeIframeRef } from "react-native-youtube-iframe";
import type { StudentVideoQuestion, SubmitVideoAnswerResponse } from "@space/shared";

import { apiErrorMessage } from "../../lib/api-error";
import type { AnswerFeedback } from "./video-question-modal";

/**
 * getCurrentTime() crosses the webview bridge as a promise, so v1's 0.1 s
 * tolerance (a synchronous call) is far too tight here (spec 13 §10 D11).
 */
const POLL_MS = 400;
const TOLERANCE_SECONDS = 0.75;
const LOAD_TIMEOUT_MS = 15_000;

/** What the barrier and the resume need: the session quiz and the part video both carry it. */
interface PlaybackSource {
  questions: StudentVideoQuestion[];
  nextQuestionId: number | null;
  furthestSeconds: number;
}

type AnswerMutation = UseMutationResult<
  SubmitVideoAnswerResponse,
  Error,
  { questionId: number; selectedIndex: number }
>;

interface PlaybackOptions {
  source: PlaybackSource;
  answer: AnswerMutation;
  /** The injectable clock — the only test seam. A webview reports no playhead under Jest. */
  readCurrentTime?: () => Promise<number>;
  /** Each playhead the poll reads while no question is open, with whether the video is meant to be playing. */
  onPoll?: (seconds: number, playing: boolean) => void;
  /** Playback stopped: paused, ended, or held at a question. */
  onStop?: () => void;
  /** The student moved the playhead with the track: the stretch since the last poll didn't play. */
  onSeeked?: () => void;
  /** The furthest a forward seek may land besides the barrier (the furthest point, with skipping blocked). */
  seekCeiling?: () => number;
  /** An answer landed; the server's furthest point comes with it. */
  onAnswered?: (res: SubmitVideoAnswerResponse) => void;
}

export function useVideoPlayback({
  source,
  answer,
  readCurrentTime,
  onPoll,
  onStop,
  onSeeked,
  seekCeiling,
  onAnswered,
}: PlaybackOptions) {
  const playerRef = useRef<YoutubeIframeRef>(null);
  const [playing, setPlayingState] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [deadlocked, setDeadlocked] = useState(false);
  const [open, setOpen] = useState<StudentVideoQuestion | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  // The barrier is the server's derivation, never recomputed from the answered
  // set (ruling C4): nextQuestionId is also the question the server will accept.
  const barrierQuestion = source.questions.find((q) => q.id === source.nextQuestionId) ?? null;
  const barrier = barrierQuestion?.atSeconds ?? Number.POSITIVE_INFINITY;

  const furthestRef = useRef(source.furthestSeconds);
  const currentRef = useRef(0);
  const barrierRef = useRef(barrier);
  const barrierQuestionRef = useRef(barrierQuestion);
  const openRef = useRef(open);
  const deadlockedRef = useRef(deadlocked);
  const playingRef = useRef(playing);
  barrierRef.current = barrier;
  barrierQuestionRef.current = barrierQuestion;
  openRef.current = open;
  deadlockedRef.current = deadlocked;
  playingRef.current = playing;
  // The callbacks outlive the render that made them (the poll, the player's events).
  const hooks = useRef({ onPoll, onStop, onSeeked, seekCeiling, onAnswered });
  hooks.current = { onPoll, onStop, onSeeked, seekCeiling, onAnswered };

  /** Every stop goes through here, so the player's own bookkeeping never misses one. */
  const setPlaying = useCallback((next: boolean | ((p: boolean) => boolean)): void => {
    const value = typeof next === "function" ? next(playingRef.current) : next;
    if (!value && playingRef.current) hooks.current.onStop?.();
    playingRef.current = value;
    setPlayingState(value);
  }, []);

  const clock = useCallback(
    () => (readCurrentTime ?? (() => playerRef.current?.getCurrentTime() ?? Promise.resolve(0)))(),
    [readCurrentTime],
  );

  // The poll starts on mount; the deadlock guard stops it only once
  // getDuration() has answered, so a player that never fires onReady still gates.
  useEffect(() => {
    // A playhead read that lands after unmount (or a clock change) sets nothing.
    let cancelled = false;
    const timer = setInterval(() => {
      if (openRef.current !== null || deadlockedRef.current) return;
      void clock()
        .then((t) => {
          if (cancelled || openRef.current !== null || deadlockedRef.current) return;
          if (t > furthestRef.current) furthestRef.current = t;
          currentRef.current = t;
          setCurrent(t);
          hooks.current.onPoll?.(t, playingRef.current);
          const gate = barrierRef.current;
          const question = barrierQuestionRef.current;
          if (question !== null && t >= gate - TOLERANCE_SECONDS) {
            setPlaying(false);
            playerRef.current?.seekTo(gate, true);
            setFeedback(null);
            setAnswerError(null);
            setOpen(question);
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clock, setPlaying]);

  // A player that never becomes ready is the same dead end as an error.
  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  const onReady = useCallback((): void => {
    setReady(true);
    // v1 interactive-video-player.tsx:127-129: reopen where the student got to, never past the barrier.
    const resumeTo = Math.min(furthestRef.current, barrierRef.current);
    if (resumeTo > 0) {
      playerRef.current?.seekTo(resumeTo, true);
      currentRef.current = resumeTo;
      setCurrent(resumeTo);
    }
    void playerRef.current
      ?.getDuration()
      .then((d) => {
        setDuration(d);
        // Deadlock guard (spec 13 §10 D2): a question past the end of the
        // recording can never be reached. The duration is not stored, so it is read here.
        if (Number.isFinite(barrierRef.current) && barrierRef.current > d + 1) setDeadlocked(true);
      })
      .catch(() => undefined);
  }, []);

  const onChangeState = useCallback(
    (state: string): void => {
      if (state === "playing") setPlaying(true);
      if (state === "paused" || state === "ended") setPlaying(false);
    },
    [setPlaying],
  );

  const onAnswer = (selectedIndex: number): void => {
    if (open === null) return;
    setAnswerError(null);
    answer.mutate(
      { questionId: open.id, selectedIndex },
      {
        onSuccess: (res) => {
          if (res.furthestSeconds > furthestRef.current) furthestRef.current = res.furthestSeconds;
          hooks.current.onAnswered?.(res);
          setFeedback({ isCorrect: res.isCorrect, correctIndex: res.correctIndex });
        },
        onError: (err) => setAnswerError(apiErrorMessage(err, "Couldn't save your answer.")),
      },
    );
  };

  const onContinue = (): void => {
    setOpen(null);
    setFeedback(null);
    setPlaying(true);
  };

  const onSeek = (fraction: number): void => {
    if (duration === null || duration <= 0) return;
    const requested = fraction * duration;
    // Forward seeks are clamped to the barrier (and the player's own ceiling);
    // backwards seeking is free, as in v1.
    const ceiling = hooks.current.seekCeiling?.() ?? Number.POSITIVE_INFINITY;
    const target = Math.min(requested, barrier, Math.max(ceiling, currentRef.current));
    playerRef.current?.seekTo(target, true);
    currentRef.current = target;
    setCurrent(target);
    hooks.current.onSeeked?.();
  };

  /** Closes the question sheet without answering, for an explicit exit from it. */
  const closeQuestion = (): void => {
    setOpen(null);
    setFeedback(null);
  };

  return {
    playerRef,
    playing,
    setPlaying,
    current,
    currentRef,
    duration,
    failed,
    setFailed,
    deadlocked,
    open,
    feedback,
    answerError,
    barrier,
    furthestRef,
    pending: answer.isPending,
    onReady,
    onChangeState,
    onAnswer,
    onContinue,
    onSeek,
    closeQuestion,
  };
}

export type VideoPlayback = ReturnType<typeof useVideoPlayback>;
