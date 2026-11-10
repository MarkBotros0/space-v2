import { Pause, Play } from "lucide-react-native";
import { View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import type { StudentVideoQuestion } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { InlineError } from "../../design/layout/route-states";
import { Button } from "../../design/ui";
import type { VideoPlayback } from "./use-video-playback";
import { VideoProgressTrack } from "./video-progress-track";

iconWithClassName(Pause, Play);

const DEADLOCK = "A question on this video is set past the end of the recording. Ask your leader to fix it.";

/**
 * The in-app YouTube player both video screens show: the frame (no YouTube
 * controls, click to play, never autoplay), the progress track and the
 * Play/Pause control, or the deadlock notice when a question can't be reached.
 */
export function VideoPlayerFrame({
  videoId,
  questions,
  playback,
  onRetry,
  onLeave,
  leaveLabel,
}: {
  videoId: string;
  questions: StudentVideoQuestion[];
  playback: VideoPlayback;
  onRetry?: () => void;
  /** An explicit exit beside Play, when the screen has one (the session's "Leave the quiz"). */
  onLeave?: () => void;
  leaveLabel?: string;
}) {
  const p = playback;
  if (p.deadlocked) {
    return (
      <InlineError
        className="rounded-group bg-surface dark:border dark:border-separator p-4"
        message={DEADLOCK}
        onRetry={() => onRetry?.()}
      />
    );
  }
  return (
    <View className="overflow-hidden rounded-group border border-border bg-black">
      <YoutubePlayer
        ref={p.playerRef}
        height={211}
        videoId={videoId}
        play={p.playing}
        initialPlayerParams={{
          controls: false,
          modestbranding: true,
          rel: false,
          preventFullScreen: true,
        }}
        onReady={p.onReady}
        onError={() => p.setFailed(true)}
        onChangeState={p.onChangeState}
      />
      <View className="bg-black px-3 py-2">
        <VideoProgressTrack
          questions={questions}
          current={p.current}
          total={p.duration ?? 0}
          barrier={p.barrier}
          onSeek={p.onSeek}
        />
        {/* v1 plays and pauses by tapping the YouTube frame; the native
            player has no controls, so the app keeps explicit ones. */}
        <View className="mt-1 flex-row items-center justify-between">
          <Button
            variant="plain"
            size="sm"
            textClassName="text-white"
            accessibilityLabel={p.playing ? "Pause" : "Play"}
            onPress={() => p.setPlaying((on) => !on)}
          >
            {p.playing ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white" />}
            {p.playing ? "Pause" : "Play"}
          </Button>
          {onLeave && leaveLabel ? (
            <Button variant="plain" size="sm" textClassName="text-white/70" onPress={onLeave}>
              {leaveLabel}
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}
