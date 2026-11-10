/** A video part on its own screen: the in-app player, how much of it counts, and the leave notice. */
import { usePreventRemove, useNavigation, useRouter } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { isWatched, type AssignmentDetail, type AssignmentPart } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import {
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Text,
} from "../../design/ui";
import { usePullRefresh } from "../../hooks/use-pull-refresh";
import { usePartVideo, useSubmitPartVideoAnswer } from "../../hooks/use-video-quiz";
import { plural } from "../../lib/plural";
import { useVideoPlayback } from "../video-quiz/use-video-playback";
import { VideoPlayerFrame } from "../video-quiz/video-player-frame";
import { VideoQuestionModal } from "../video-quiz/video-question-modal";
import { leaveVideoNotice, watchedRun } from "./leave-video-notice";
import { usePartWatching } from "./use-part-watching";

iconWithClassName(ExternalLink);

type VideoPart = Extract<AssignmentPart, { kind: "VIDEO" }>;
type PartVideo = NonNullable<ReturnType<typeof usePartVideo>["data"]>;
/** The navigation the leave guard held back: dispatched again on Leave. */
type LeaveAction = Parameters<NonNullable<Parameters<typeof usePreventRemove>[1]>>[0]["data"]["action"];

/** The link out when the app can't play it. Watching on YouTube is never counted, and the student is told so. */
function VideoFallback({ youtubeUrl }: { youtubeUrl: string }) {
  return (
    <View className="gap-2">
      <Button accessibilityRole="link" className="self-start" onPress={() => void Linking.openURL(youtubeUrl)}>
        <ExternalLink
          size={16}
          className="shrink-0 text-primary-foreground"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        Watch on YouTube
      </Button>
      <Text variant="caption" className="text-muted-foreground">
        This video can't be played in the app, so watching it there won't count.
      </Text>
    </View>
  );
}

/** "Not finished yet", on leaving before the video counts. A stray backdrop tap keeps watching. */
function LeaveNotice({
  notice,
  open,
  onKeepWatching,
  onLeave,
}: {
  notice: { title: string; body: string } | null;
  open: boolean;
  onKeepWatching: () => void;
  onLeave: () => void;
}) {
  return (
    <Modal open={open && notice !== null} onOpenChange={(next) => (next ? undefined : onKeepWatching())}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{notice?.title ?? ""}</ModalTitle>
          <ModalDescription>{notice?.body ?? ""}</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button variant="secondary" onPress={onLeave}>
            Leave
          </Button>
          <Button onPress={onKeepWatching}>Keep watching</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function PartPlayer({ detail, part, video }: { detail: AssignmentDetail; part: VideoPart; video: PartVideo }) {
  const router = useRouter();
  const navigation = useNavigation();
  const record = !detail.readOnly;
  const answer = useSubmitPartVideoAnswer(detail.id, part.id);
  // The watching hook needs `playing` from the playback, and the playback reports to it.
  const watchingRef = useRef<ReturnType<typeof usePartWatching> | null>(null);
  const playback = useVideoPlayback({
    source: video,
    answer,
    onPoll: (t, playing) => watchingRef.current?.onPoll(t, playing),
    onStop: () => watchingRef.current?.onStop(),
    onSeeked: () => watchingRef.current?.onSeeked(),
    // With skipping blocked, a forward seek stops at the furthest point reached; rewinding is free.
    seekCeiling: video.blockSkipping ? () => playback.furthestRef.current : undefined,
  });
  const watching = usePartWatching({
    assignmentId: detail.id,
    partId: part.id,
    initialRanges: video.watchedIntervals,
    playing: playback.playing,
    record,
  });
  watchingRef.current = watching;

  const { setPlaying } = playback;
  // The player pauses when the app leaves the foreground; the watching hook reports then too.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setPlaying(false);
    });
    return () => sub.remove();
  }, [setPlaying]);

  const duration = video.durationSeconds;
  const watched = watching.watchedSeconds;
  const counts = isWatched(watched, duration);
  const notice = leaveVideoNotice({
    watchedSeconds: watched,
    durationSeconds: duration,
    furthestSeconds: Math.max(video.furthestSeconds, playback.current),
    blockSkipping: video.blockSkipping,
  });
  const [leaving, setLeaving] = useState<LeaveAction | null>(null);
  // The question sheet's own "Leave the video" is an explicit exit: it closes the sheet and
  // goes, with no second modal over the first (iOS won't present one there).
  const leaveFromSheet = useRef(false);
  // Nothing to watch in the app (no video, a failed player, an unreachable question): nothing to warn about.
  const playable = video.videoId !== null && !playback.failed && !playback.deadlocked;
  usePreventRemove(record && playable && notice !== null, ({ data }) => {
    if (leaveFromSheet.current) {
      navigation.dispatch(data.action);
      return;
    }
    setPlaying(false);
    setLeaving(data.action);
  });

  const questions = video.questions.length;
  return (
    <View className="gap-4">
      {video.videoId === null || playback.failed ? (
        <VideoFallback youtubeUrl={part.youtubeUrl} />
      ) : (
        <VideoPlayerFrame videoId={video.videoId} questions={video.questions} playback={playback} />
      )}
      <View className="gap-1">
        <Text variant="subhead" accessibilityLiveRegion="polite">
          {counts ? "Watched" : `Watched ${watchedRun(watched, duration)}`}
        </Text>
        {questions > 0 ? (
          <Text variant="caption" className="text-muted-foreground">
            {`${video.answeredCount} of ${plural(questions, "question")} answered`}
          </Text>
        ) : null}
        {counts ? null : (
          <Text variant="caption" className="text-muted-foreground">
            It counts once you've watched at least 90% of it.
          </Text>
        )}
        {video.blockSkipping ? (
          <Text variant="caption" className="text-muted-foreground">
            You can't skip ahead in this video.
          </Text>
        ) : null}
        {record ? null : (
          <Text variant="caption" className="text-muted-foreground">
            This season has finished, so watching now isn't recorded.
          </Text>
        )}
      </View>
      <VideoQuestionModal
        question={playback.open}
        feedback={playback.feedback}
        pending={playback.pending}
        answerError={playback.answerError}
        onAnswer={playback.onAnswer}
        onContinue={playback.onContinue}
        onLeave={() => {
          leaveFromSheet.current = true;
          playback.closeQuestion();
          router.back();
        }}
        leaveLabel="Leave the video"
      />
      <LeaveNotice
        notice={notice}
        open={leaving !== null}
        onKeepWatching={() => setLeaving(null)}
        onLeave={() => {
          const action = leaving;
          setLeaving(null);
          if (action !== null) navigation.dispatch(action);
        }}
      />
    </View>
  );
}

export function VideoPartScreen({ detail, part }: { detail: AssignmentDetail; part: VideoPart }) {
  const video = usePartVideo(detail.id, part.id);
  const pull = usePullRefresh(() => video.refetch());
  return (
    <Screen title={part.title} subtitle={detail.title} onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      {video.data !== undefined ? (
        <PartPlayer detail={detail} part={part} video={video.data} />
      ) : video.isPending ? (
        <RouteSkeleton />
      ) : (
        <RouteError onRetry={() => void video.refetch()} />
      )}
    </Screen>
  );
}
