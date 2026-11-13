import { useState } from "react";
import { View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import type { StudentVideoQuestion } from "@space/shared";

import { InlineError } from "../../design/layout/route-states";
import { videoHeight } from "../../design/lib/video-size";
import { Button } from "../../design/ui";
import type { VideoPlayback } from "./use-video-playback";
import { VideoProgressTrack } from "./video-progress-track";

const DEADLOCK = "A question on this video is set past the end of the recording. Ask your leader to fix it.";

/**
 * The in-app YouTube player both video screens show: the frame with YouTube's
 * own controls (play, captions, speed; owner, 2026-11-13: the app's own Play
 * button didn't start the video), never autoplaying, and the progress track
 * with the questions on it; or the deadlock notice when a question can't be
 * reached. Whether it is playing comes from the player's own state changes.
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
  /** An explicit exit under the track, when the screen has one (the session's "Leave the quiz"). */
  onLeave?: () => void;
  leaveLabel?: string;
}) {
  const p = playback;
  const [width, setWidth] = useState(0);
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
    <View
      className="overflow-hidden rounded-group border border-border bg-black"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <YoutubePlayer
        ref={p.playerRef}
        height={videoHeight(width)}
        videoId={videoId}
        play={p.playing}
        initialPlayerParams={{
          controls: true,
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
        {onLeave && leaveLabel ? (
          <View className="mt-1 flex-row justify-end">
            <Button variant="plain" size="sm" textClassName="text-white/70" onPress={onLeave}>
              {leaveLabel}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}
