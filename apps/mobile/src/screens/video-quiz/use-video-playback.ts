/**
 * The core both video players share (a session's video and an assignment's
 * video part): the playhead poll, the question barrier, resuming where the
 * student got to, snapping back a skip and the question sheet's state. What each
 * player does with the playhead (save the furthest point, count the watched
 * ranges) stays in the player, through `onPoll` and `onStop`.
 */
import type { UseMutationResult } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { YoutubeIframeRef } from "react-native-youtube-iframe";
import type { StudentVideoQuestion, SubmitVideoAnswerResponse } from "@space/shared";

import { apiErrorMessage } from "../../lib/api-error";
import { clampSeek } from "./player-model";
import type { AnswerFeedback } from "./video-question-modal";

/**
 * getCurrentTime() crosses the webview bridge as a promise, so v1's 0.1 s
 * tolerance (a synchronous call) is far too tight here (spec 13 §10 D11).
 */
const POLL_MS = 400;
const TOLERANCE_SECONDS = 0.75;
const LOAD_TIMEOUT_MS = 15_000;
/**
 * A playhead this far past the ceiling between two polls is a skip on YouTube's own bar, not play:
 * 400 ms at 2x is 0.8 s, so 3 s leaves room for a slow bridge.
 */
const SKIP_SECONDS = 3;
/**
 * A Play the player hasn't taken up (no "playing" or "buffering") within this long is undone, so the
 * bar never shows Pause over a stopped video, and the student is asked to tap the video itself.
 */
const PLAY_CONFIRM_MS = 3000;

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
  /** A skip was snapped back: the stretch since the last poll didn't play. */
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
  const [rate, setRateState] = useState(1);
  const rateRef = useRef(1);
  // A Play the player didn't take up: the student taps the picture, which YouTube always obeys.
  const [needsTap, setNeedsTap] = useState(false);
  // YouTube's own last reported state, the truth the bar follows (owner, 2026-11-15: the bar showed
  // Pause over a stopped video).
  const ytStateRef = useRef("unstarted");
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Going into or out of full screen while playing: the new frame plays once it is ready.
  const resumeOnReadyRef = useRef(false);
  const [fullScreen, setFullScreenState] = useState(false);
  // Going in or out of full screen makes the frame again: until it is ready its playhead reads 0.
  const remakingRef = useRef(false);
  const fullScreenRef = useRef(false);
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
  const durationRef = useRef(duration);
  durationRef.current = duration;
  barrierRef.current = barrier;
  barrierQuestionRef.current = barrierQuestion;
  openRef.current = open;
  deadlockedRef.current = deadlocked;
  playingRef.current = playing;
  // The callbacks outlive the render that made them (the poll, the player's events).
  const hooks = useRef({ onPoll, onStop, onSeeked, seekCeiling, onAnswered });
  hooks.current = { onPoll, onStop, onSeeked, seekCeiling, onAnswered };

  /** Every stop goes through here, so the player's own bookkeeping never misses one. */
  const applyPlaying = useCallback((value: boolean): void => {
    if (!value && playingRef.current) hooks.current.onStop?.();
    playingRef.current = value;
    setPlayingState(value);
  }, []);

  const clearConfirm = useCallback((): void => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
  }, []);

  /**
   * The app's Play or Pause: the command goes to the player (injected, see the patch in
   * pnpm-workspace.yaml) and the bar follows at once. A Play the player doesn't take up is undone
   * after PLAY_CONFIRM_MS; YouTube's own reports (`onChangeState`) correct the bar either way.
   */
  const setPlaying = useCallback(
    (next: boolean | ((p: boolean) => boolean)): void => {
      const value = typeof next === "function" ? next(playingRef.current) : next;
      clearConfirm();
      if (value) {
        playerRef.current?.playVideo();
        setNeedsTap(false);
        if (ytStateRef.current !== "playing") {
          confirmTimerRef.current = setTimeout(() => {
            confirmTimerRef.current = null;
            const s = ytStateRef.current;
            if (s === "playing" || s === "buffering") return;
            applyPlaying(false);
            setNeedsTap(true);
          }, PLAY_CONFIRM_MS);
        }
      } else {
        playerRef.current?.pauseVideo();
      }
      applyPlaying(value);
    },
    [applyPlaying, clearConfirm],
  );

  useEffect(() => clearConfirm, [clearConfirm]);

  const setRate = useCallback((next: number): void => {
    rateRef.current = next;
    setRateState(next);
    playerRef.current?.setPlaybackRate(next);
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
      if (openRef.current !== null || deadlockedRef.current || remakingRef.current) return;
      void clock()
        .then((t) => {
          if (cancelled || openRef.current !== null || deadlockedRef.current || remakingRef.current) return;
          // YouTube's own controls can skip ahead; with a ceiling (skipping blocked) the playhead goes back.
          const ceiling = hooks.current.seekCeiling?.();
          if (ceiling !== undefined && t > Math.max(ceiling, currentRef.current) + SKIP_SECONDS) {
            playerRef.current?.seekTo(ceiling, true);
            currentRef.current = ceiling;
            setCurrent(ceiling);
            hooks.current.onSeeked?.();
            return;
          }
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

  const setFullScreen = useCallback((next: boolean | ((now: boolean) => boolean)): void => {
    const value = typeof next === "function" ? next(fullScreenRef.current) : next;
    if (value === fullScreenRef.current) return;
    fullScreenRef.current = value;
    remakingRef.current = true;
    resumeOnReadyRef.current = playingRef.current;
    setFullScreenState(value);
  }, []);

  const onReady = useCallback((): void => {
    remakingRef.current = false;
    setReady(true);
    // v1 interactive-video-player.tsx:127-129: reopen where the student got to, never past the barrier.
    // A player made again (going in or out of full screen) carries on from the playhead instead.
    const from = currentRef.current > 0 ? currentRef.current : furthestRef.current;
    const resumeTo = Math.min(from, barrierRef.current);
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
    if (rateRef.current !== 1) playerRef.current?.setPlaybackRate(rateRef.current);
    if (resumeOnReadyRef.current) {
      resumeOnReadyRef.current = false;
      setPlaying(true);
    }
  }, [setPlaying]);

  /** YouTube's own reports: the bar follows what the player does, whoever started or stopped it. */
  const onChangeState = useCallback(
    (state: string): void => {
      ytStateRef.current = state;
      if (state === "playing") {
        clearConfirm();
        setNeedsTap(false);
        applyPlaying(true);
      }
      if (state === "paused" || state === "ended" || state === "video cued") {
        clearConfirm();
        applyPlaying(false);
      }
    },
    [applyPlaying, clearConfirm],
  );

  /**
   * A seek from the app's own bar or buttons (`clampSeek`): back is free; forward stops at the next
   * unanswered question and, with skipping blocked, at the furthest point watched. Returns where it landed.
   */
  const seek = useCallback((target: number): number => {
    if (openRef.current !== null) return currentRef.current;
    const to = clampSeek(target, {
      ceiling: hooks.current.seekCeiling?.(),
      barrier: barrierRef.current,
      duration: durationRef.current,
      current: currentRef.current,
    });
    playerRef.current?.seekTo(to, true);
    currentRef.current = to;
    setCurrent(to);
    // The stretch the seek crossed never played: the watched count starts a new run.
    hooks.current.onSeeked?.();
    return to;
  }, []);

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
    ready,
    needsTap,
    rate,
    setRate,
    fullScreen,
    setFullScreen,
    seek,
    /** The skipping limit now (see `seekCeiling`), for the bar's lighter stretch; read after render. */
    ceilingNow: () => hooks.current.seekCeiling?.(),
    questions: source.questions,
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
    closeQuestion,
  };
}

export type VideoPlayback = ReturnType<typeof useVideoPlayback>;
