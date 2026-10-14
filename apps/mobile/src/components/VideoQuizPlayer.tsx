import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Lock, Pause, Play, Video, X } from "lucide-react-native";
import { AppState, Linking, Pressable, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import YoutubePlayer, { type YoutubeIframeRef } from "react-native-youtube-iframe";
import { formatTimestamp, type StudentVideoQuestion, type StudentVideoQuiz } from "@space/shared";

import { useSaveVideoProgress, useSubmitVideoAnswer } from "../hooks/use-video-quiz";
import { apiErrorMessage } from "../lib/api-error";
import { cn } from "../design/lib/cn";
import { iconWithClassName } from "../design/lib/icon";
import { shadowStyle } from "../design/lib/shadow";
import { Eyebrow } from "../design/layout/page-title";
import { Button, Modal, ModalContent, ModalHeader, ModalTitle, Text } from "../design/ui";

iconWithClassName(Check, Lock, Pause, Play, Video, X);

/**
 * getCurrentTime() crosses the webview bridge as a promise, so v1's 0.1 s
 * tolerance (a synchronous call) is far too tight here (spec 13 §10 D11).
 */
const POLL_MS = 400;
const TOLERANCE_SECONDS = 0.75;
const PROGRESS_SAVE_MS = 15_000;
const LOAD_TIMEOUT_MS = 15_000;

export interface VideoQuizPlayerProps {
  sessionId: number;
  quiz: StudentVideoQuiz;
  /** Wired to the quiz query's refetch by the screen; used by the deadlock guard. */
  onRetry?: () => void;
  /**
   * The injectable clock — the only test seam. A webview reports no playhead
   * under Jest, so the test supplies one and the ordinary poll opens the modal.
   */
  readCurrentTime?: () => Promise<number>;
}

interface AnswerFeedback {
  isCorrect: boolean;
  correctIndex: number;
}

/** v1's "Watch recording" link button (sessions/[id]/page.tsx). */
export function WatchRecordingButton({ youtubeUrl }: { youtubeUrl: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(youtubeUrl)}
      className="flex-row items-center justify-center gap-2 rounded-lg bg-brand-teal-600 px-4 py-3 active:bg-brand-teal-700"
      style={{ boxShadow: "0px 2px 8px 0px rgba(93, 185, 188, 0.35)" }}
    >
      <Video size={16} className="shrink-0 text-white" />
      <Text className="text-sm font-bold text-white">Watch recording</Text>
    </Pressable>
  );
}

/** The link stays when the app can't play the video; the silence does not (spec 13 R37). */
function VideoFallback({ youtubeUrl }: { youtubeUrl: string | null }) {
  return (
    <View className="flex-col gap-2">
      {youtubeUrl ? <WatchRecordingButton youtubeUrl={youtubeUrl} /> : null}
      <Text className="text-xs text-muted-foreground">This session's video link can't be played in the app.</Text>
    </View>
  );
}

export function VideoQuizPlayer({ sessionId, quiz, onRetry, readCurrentTime }: VideoQuizPlayerProps) {
  const router = useRouter();
  const playerRef = useRef<YoutubeIframeRef>(null);
  const submit = useSubmitVideoAnswer(sessionId);
  const saveProgress = useSaveVideoProgress(sessionId);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [deadlocked, setDeadlocked] = useState(false);
  const [open, setOpen] = useState<StudentVideoQuestion | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // The barrier is the server's derivation, never recomputed from the answered
  // set (ruling C4): nextQuestionId is also the question the server will accept.
  const barrier =
    quiz.questions.find((q) => q.id === quiz.nextQuestionId)?.atSeconds ?? Number.POSITIVE_INFINITY;
  const barrierQuestion = quiz.questions.find((q) => q.id === quiz.nextQuestionId) ?? null;

  const furthestRef = useRef(quiz.furthestSeconds);
  const lastSavedRef = useRef(quiz.furthestSeconds);
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

  const clock = useCallback(
    () => (readCurrentTime ?? (() => playerRef.current?.getCurrentTime() ?? Promise.resolve(0)))(),
    [readCurrentTime],
  );

  const saveRef = useRef(saveProgress.mutate);
  saveRef.current = saveProgress.mutate;
  const flushProgress = useCallback((): void => {
    const seconds = Math.floor(furthestRef.current);
    if (seconds <= lastSavedRef.current) return;
    lastSavedRef.current = seconds;
    saveRef.current(seconds);
  }, []);

  // The poll starts on mount; the deadlock guard stops it only once
  // getDuration() has answered, so a player that never fires onReady still gates.
  useEffect(() => {
    const timer = setInterval(() => {
      if (openRef.current !== null || deadlockedRef.current) return;
      void clock()
        .then((t) => {
          if (openRef.current !== null || deadlockedRef.current) return;
          if (t > furthestRef.current) furthestRef.current = t;
          setCurrent(t);
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
    return () => clearInterval(timer);
  }, [clock]);

  // Advisory progress: every 15 s while playing, on pause, on leaving the
  // foreground, and on unmount. v1 saves only on three edge events (R49).
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(flushProgress, PROGRESS_SAVE_MS);
    return () => clearInterval(timer);
  }, [playing, flushProgress]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") flushProgress();
    });
    return () => {
      sub.remove();
      flushProgress();
    };
  }, [flushProgress]);

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
      setCurrent(resumeTo);
    }
    void playerRef.current
      ?.getDuration()
      .then((d) => {
        setDuration(d);
        // Deadlock guard (spec 13 §10 D2): a question past the end of the
        // recording can never be reached. The duration is not stored (C1).
        if (Number.isFinite(barrierRef.current) && barrierRef.current > d + 1) setDeadlocked(true);
      })
      .catch(() => undefined);
  }, []);

  const handleLeave = useCallback((): void => {
    setPlaying(false);
    flushProgress();
    router.back();
  }, [flushProgress, router]);

  const onAnswer = (selectedIndex: number): void => {
    if (open === null) return;
    setAnswerError(null);
    submit.mutate(
      { questionId: open.id, selectedIndex },
      {
        onSuccess: (res) => {
          if (res.furthestSeconds > furthestRef.current) furthestRef.current = res.furthestSeconds;
          lastSavedRef.current = Math.max(lastSavedRef.current, res.furthestSeconds);
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

  const onSeekPress = (x: number): void => {
    if (duration === null || duration <= 0 || trackWidth <= 0) return;
    const requested = Math.max(0, Math.min(1, x / trackWidth)) * duration;
    // Forward seeks are clamped to the barrier; backwards seeking is free, as in v1.
    const target = Math.min(requested, barrier);
    playerRef.current?.seekTo(target, true);
    setCurrent(target);
  };

  if (quiz.videoId === null || failed) {
    return <VideoFallback youtubeUrl={quiz.youtubeUrl} />;
  }

  const deadlockMessage =
    "A question on this video is set past the end of the recording. Ask your leader to fix it.";
  const total = duration ?? 0;
  const playedPct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const lockedFrom = total > 0 && Number.isFinite(barrier) ? Math.min(100, (barrier / total) * 100) : 100;

  return (
    <View className="flex-col gap-3">
      {deadlocked ? (
        <View className="flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4">
          <Text className="text-sm text-error-600 dark:text-error-400">{deadlockMessage}</Text>
          <Button variant="outline" size="sm" onPress={() => onRetry?.()}>
            Try again
          </Button>
        </View>
      ) : (
        <View className="overflow-hidden rounded-2xl border border-border bg-black" style={shadowStyle("soft")}>
          <YoutubePlayer
            ref={playerRef}
            height={211}
            videoId={quiz.videoId}
            play={playing}
            initialPlayerParams={{
              controls: false,
              modestbranding: true,
              rel: false,
              preventFullScreen: true,
            }}
            onReady={onReady}
            onError={() => setFailed(true)}
            onChangeState={(state: string) => {
              if (state === "playing") setPlaying(true);
              if (state === "paused" || state === "ended") {
                setPlaying(false);
                flushProgress();
              }
            }}
          />
          <View className="bg-black px-3 py-2">
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Video progress"
              onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
              onPress={(e) => onSeekPress(e.nativeEvent.locationX)}
              className="h-6 justify-center"
            >
              <View className="h-1.5 w-full rounded-full bg-white/20">
                {lockedFrom < 100 ? (
                  <View
                    className="absolute bottom-0 right-0 top-0 rounded-r-full bg-white/5"
                    style={{ left: `${lockedFrom}%` }}
                  />
                ) : null}
                <View className="absolute bottom-0 left-0 top-0 rounded-full bg-brand-teal-500" style={{ width: `${playedPct}%` }} />
                {total > 0
                  ? quiz.questions.map((q) => (
                      <View
                        key={q.id}
                        className={cn("absolute size-2 rounded-full", q.answered ? "bg-success-500" : "bg-warning-400")}
                        style={{ left: `${Math.min(100, (q.atSeconds / total) * 100)}%`, top: -1, marginLeft: -4 }}
                      />
                    ))
                  : null}
              </View>
            </Pressable>
            <View className="flex-row items-center justify-between">
              <Text className="font-mono text-[11px] font-medium text-white/70">
                {`${formatTimestamp(current)} / ${formatTimestamp(total)}`}
              </Text>
              {Number.isFinite(barrier) && barrier < total ? (
                <View className="flex-row items-center gap-1">
                  <Lock size={12} className="text-white/70" />
                  <Text className="text-[11px] font-medium text-white/70">Answer to unlock</Text>
                </View>
              ) : null}
            </View>
            {/* v1 plays and pauses by tapping the YouTube frame; the native
                player has no controls, so the app keeps explicit ones. */}
            <View className="mt-1 flex-row items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                textClassName="text-white"
                accessibilityLabel={playing ? "Pause" : "Play"}
                onPress={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <Button variant="ghost" size="sm" textClassName="text-white/70" onPress={handleLeave}>
                Leave the quiz
              </Button>
            </View>
          </View>
        </View>
      )}

      <View className="flex-row items-center justify-between rounded-xl border border-border bg-card p-4">
        <View>
          <Text className="text-sm font-semibold text-brand-navy-900 dark:text-foreground">
            {quiz.completedAt !== null ? "Quiz complete" : "In progress"}
          </Text>
          <Text className="text-xs text-muted-foreground">{`${quiz.answeredCount} of ${quiz.questions.length} answered`}</Text>
        </View>
        <View className="items-end">
          <Text className="text-lg font-black text-brand-teal-700 dark:text-brand-teal-300">
            {String(quiz.earnedPoints)}
            <Text className="text-sm font-semibold text-muted-foreground">{`/${quiz.totalPoints}`}</Text>
          </Text>
          <Eyebrow>Points</Eyebrow>
        </View>
      </View>

      {/* v1's QuestionModal ignores dismissal; here any dismiss (Android back,
          backdrop, X) is an explicit exit — left alone it would delete the gate
          (spec 13 §10 D15). */}
      <Modal
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) handleLeave();
        }}
      >
        <ModalContent>
          {open !== null ? (
            <>
              <ModalHeader>
                <ModalTitle>{open.prompt}</ModalTitle>
              </ModalHeader>
              <View className="flex-col gap-2">
                {open.options.map((option, index) => {
                  const correct = feedback !== null && index === feedback.correctIndex;
                  return (
                    <Pressable
                      key={`${open.id}-${index}`}
                      accessibilityRole="button"
                      disabled={submit.isPending || feedback !== null}
                      onPress={() => onAnswer(index)}
                      className={cn(
                        "flex-row items-center justify-between gap-2 rounded-xl border px-4 py-3",
                        correct ? "border-success-600 bg-success-600/10" : "border-border bg-card active:border-brand-teal-500",
                      )}
                    >
                      <Text
                        className={cn(
                          "flex-1 text-sm font-medium",
                          correct ? "text-success-700 dark:text-success-300" : "text-foreground",
                        )}
                      >
                        {option}
                      </Text>
                      {correct ? <Check size={16} className="shrink-0 text-success-700 dark:text-success-300" /> : null}
                    </Pressable>
                  );
                })}
                {answerError ? <Text className="text-xs text-error-600">{answerError}</Text> : null}
                {feedback !== null ? (
                  <View className="mt-2 flex-col gap-3">
                    {feedback.isCorrect ? (
                      <View className="flex-row items-center gap-2">
                        <Check size={16} className="text-success-700 dark:text-success-300" />
                        <Text className="text-sm font-bold text-success-700 dark:text-success-300">Correct!</Text>
                      </View>
                    ) : (
                      <View className="flex-row items-center gap-2">
                        <X size={16} className="text-error-600" />
                        <Text className="flex-1 text-sm font-bold text-error-600">
                          Not quite — the correct answer is highlighted.
                        </Text>
                      </View>
                    )}
                    <Button onPress={onContinue}>Continue</Button>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </ModalContent>
      </Modal>
    </View>
  );
}
