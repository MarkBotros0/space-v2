import { useCallback, useEffect, useRef } from "react";
import { Video } from "lucide-react-native";
import { AppState, Linking, View } from "react-native";
import { useRouter } from "expo-router";
import type { StudentVideoQuiz } from "@space/shared";

import { useSaveVideoProgress, useSubmitVideoAnswer } from "../../hooks/use-video-quiz";
import { iconWithClassName } from "../../design/lib/icon";
import { Eyebrow } from "../../design/layout/page-title";
import { Button, Text } from "../../design/ui";
import { useVideoPlayback } from "./use-video-playback";
import { VideoPlayerFrame } from "./video-player-frame";
import { VideoQuestionModal } from "./video-question-modal";

iconWithClassName(Video);

const PROGRESS_SAVE_MS = 15_000;

interface VideoQuizPlayerProps {
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

/** v1's "Watch recording" link, as the primary Button with the video icon. */
export function WatchRecordingButton({ youtubeUrl }: { youtubeUrl: string }) {
  return (
    <Button accessibilityRole="link" onPress={() => void Linking.openURL(youtubeUrl)}>
      <Video size={16} className="shrink-0 text-primary-foreground" />
      Watch recording
    </Button>
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
  const submit = useSubmitVideoAnswer(sessionId);
  const saveProgress = useSaveVideoProgress(sessionId);

  const lastSavedRef = useRef(quiz.furthestSeconds);
  const saveRef = useRef(saveProgress.mutate);
  saveRef.current = saveProgress.mutate;
  // Reads the playback's furthest point, which the hook below fills in.
  const furthest = useRef<{ current: number } | null>(null);
  const flushProgress = useCallback((): void => {
    const seconds = Math.floor(furthest.current?.current ?? 0);
    if (seconds <= lastSavedRef.current) return;
    lastSavedRef.current = seconds;
    saveRef.current(seconds);
  }, []);

  const playback = useVideoPlayback({
    source: quiz,
    answer: submit,
    readCurrentTime,
    onStop: flushProgress,
    onAnswered: (res) => {
      lastSavedRef.current = Math.max(lastSavedRef.current, res.furthestSeconds);
    },
  });
  furthest.current = playback.furthestRef;
  const { playing, setPlaying } = playback;

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

  const handleLeave = useCallback((): void => {
    setPlaying(false);
    flushProgress();
    router.back();
  }, [flushProgress, router, setPlaying]);

  if (quiz.videoId === null || playback.failed) {
    return <VideoFallback youtubeUrl={quiz.youtubeUrl} />;
  }

  return (
    <View className="flex-col gap-3">
      <VideoPlayerFrame
        videoId={quiz.videoId}
        questions={quiz.questions}
        playback={playback}
        onRetry={onRetry}
        onLeave={handleLeave}
        leaveLabel="Leave the quiz"
      />

      <View className="flex-row items-center justify-between rounded-group bg-surface p-4 dark:border dark:border-separator">
        <View>
          <Text className="text-sm font-semibold text-brand-navy-900 dark:text-foreground">
            {quiz.completedAt !== null ? "Quiz complete" : "In progress"}
          </Text>
          <Text className="text-xs text-muted-foreground">{`${quiz.answeredCount} of ${quiz.questions.length} answered`}</Text>
        </View>
        <View className="items-end">
          <Text className="text-lg font-black text-brand-teal-800 dark:text-brand-teal-300">
            {String(quiz.earnedPoints)}
            <Text className="text-sm font-semibold text-muted-foreground">{`/${quiz.totalPoints}`}</Text>
          </Text>
          <Eyebrow>Points</Eyebrow>
        </View>
      </View>

      <VideoQuestionModal
        question={playback.open}
        feedback={playback.feedback}
        pending={playback.pending}
        answerError={playback.answerError}
        onAnswer={playback.onAnswer}
        onContinue={playback.onContinue}
        onLeave={handleLeave}
      />
    </View>
  );
}
