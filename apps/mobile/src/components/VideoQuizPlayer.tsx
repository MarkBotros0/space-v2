import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Pressable, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import YoutubePlayer, { type YoutubeIframeRef } from "react-native-youtube-iframe";
import { formatTimestamp, type StudentVideoQuestion, type StudentVideoQuiz } from "@space/shared";

import { useSaveVideoProgress, useSubmitVideoAnswer } from "../hooks/use-video-quiz";
import { apiErrorMessage } from "../lib/api-error";
import { useTheme } from "../theme";
import { Button, Card, EmptyState, ErrorState, Text } from "../ui";

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

function VideoFallback({ youtubeUrl }: { youtubeUrl: string | null }) {
  return (
    <EmptyState
      title="Video unavailable"
      message="This session's video link can't be played in the app."
      action={
        youtubeUrl ? (
          <Button title="Watch on YouTube" onPress={() => void Linking.openURL(youtubeUrl)} />
        ) : undefined
      }
    />
  );
}

export function VideoQuizPlayer({ sessionId, quiz, onRetry, readCurrentTime }: VideoQuizPlayerProps) {
  const theme = useTheme();
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

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Card style={{ gap: theme.spacing.xs }}>
        <Text variant="heading">{`${quiz.earnedPoints} / ${quiz.totalPoints} points`}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${quiz.answeredCount} of ${quiz.questions.length} questions answered`}
        </Text>
        {quiz.completedAt !== null ? <Text variant="label">Quiz complete</Text> : null}
      </Card>

      {deadlocked ? (
        <ErrorState message={deadlockMessage} onRetry={() => onRetry?.()} />
      ) : (
        <>
          <YoutubePlayer
            ref={playerRef}
            height={220}
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
          <View style={{ gap: theme.spacing.xs }}>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Video position"
              onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
              onPress={(e) => onSeekPress(e.nativeEvent.locationX)}
              // 44 px touch target (jpc-space/CLAUDE.md); the track is drawn inside it.
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.neutral[300],
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: 6,
                    width: `${duration && duration > 0 ? Math.min(100, (current / duration) * 100) : 0}%`,
                    backgroundColor: theme.colors.brand.teal[500],
                  }}
                />
              </View>
            </Pressable>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {`${formatTimestamp(current)} / ${formatTimestamp(duration ?? 0)}`}
            </Text>
          </View>
          <Button
            title={playing ? "Pause" : "Play"}
            variant="secondary"
            onPress={() => setPlaying((p) => !p)}
          />
        </>
      )}

      <Button title="Leave the quiz" variant="ghost" onPress={handleLeave} />

      <Modal
        visible={open !== null}
        transparent
        animationType="slide"
        // The Android hardware back button. Left undefined it dismisses the
        // modal and deletes the gate (spec 13 §10 D15), so it is an explicit exit.
        onRequestClose={handleLeave}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              backgroundColor: theme.colors.white,
              padding: theme.spacing.lg,
              gap: theme.spacing.sm,
              borderTopLeftRadius: theme.radii.lg,
              borderTopRightRadius: theme.radii.lg,
            }}
          >
            {open !== null ? (
              <>
                <Text variant="heading">{open.prompt}</Text>
                {feedback === null ? (
                  open.options.map((option, index) => (
                    <Button
                      key={`${open.id}-${index}`}
                      title={option}
                      variant="ghost"
                      onPress={() => onAnswer(index)}
                      loading={submit.isPending}
                    />
                  ))
                ) : (
                  <>
                    <Text variant="body">
                      {feedback.isCorrect
                        ? "Correct"
                        : `Not quite — the answer was ${open.options[feedback.correctIndex] ?? ""}`}
                    </Text>
                    <Button title="Continue" onPress={onContinue} />
                  </>
                )}
                {answerError ? (
                  <Text variant="label" color={theme.colors.error[500]}>
                    {answerError}
                  </Text>
                ) : null}
                <Button title="Leave the quiz" variant="ghost" onPress={handleLeave} />
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
