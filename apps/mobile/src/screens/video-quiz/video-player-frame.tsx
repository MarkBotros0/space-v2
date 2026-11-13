import { useState } from "react";
import { View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";

import { InlineError } from "../../design/layout/route-states";
import { videoHeight } from "../../design/lib/video-size";
import { Button } from "../../design/ui";
import type { VideoPlayback } from "./use-video-playback";

const DEADLOCK = "A question on this video is set past the end of the recording. Ask your leader to fix it.";

/**
 * The in-app YouTube player both video screens show: the frame with YouTube's
 * own controls (play, captions, speed, full screen, the seek bar; owner,
 * 2026-11-13: one set of controls, not the app's beside YouTube's), never
 * autoplaying; or the deadlock notice when a question can't be reached. A skip
 * past a question or, with skipping blocked, past what was watched snaps back
 * on the next poll (`use-video-playback.ts`). Whether it is playing comes from the player's own state changes.
 */
export function VideoPlayerFrame({
  videoId,
  playback,
  onRetry,
  onLeave,
  leaveLabel,
}: {
  videoId: string;
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
          // Full screen is allowed (owner, 2026-11-13). A question that comes up there pauses the
          // video; it shows once the student leaves full screen.
          preventFullScreen: false,
        }}
        onReady={p.onReady}
        onError={() => p.setFailed(true)}
        onChangeState={p.onChangeState}
      />
      {/* YouTube's own bar is the only one (owner, 2026-11-13: "I don't like having two controls"). */}
      {onLeave && leaveLabel ? (
        <View className="flex-row justify-end bg-black px-3 py-1">
          <Button variant="plain" size="sm" textClassName="text-white/70" onPress={onLeave}>
            {leaveLabel}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
