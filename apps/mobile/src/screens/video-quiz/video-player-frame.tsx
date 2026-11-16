import * as ScreenOrientation from "expo-screen-orientation";
import { setStatusBarHidden, StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { SafeAreaView } from "react-native-safe-area-context";

import { InlineError } from "../../design/layout/route-states";
import { videoHeight } from "../../design/lib/video-size";
import { Button } from "../../design/ui";
import type { VideoPlayback } from "./use-video-playback";
import { VideoControls } from "./video-controls";
import { confirmOpenYouTube, PLAYER_BASE_URL, youTubeLinkGuard } from "./youtube-link-guard";

const DEADLOCK = "A question on this video is set past the end of the recording. Ask your leader to fix it.";

/** What the student is told before a YouTube link leaves the app's player (owner, 2026-11-15). */
const YOUTUBE_WARNING = "Watching in YouTube doesn't count toward your progress here. Come back to the app to finish.";
const YOUTUBE_PLAIN = "This opens the video in the YouTube app.";

/**
 * The YouTube frame with its own controls off. Nothing covers it and nothing of YouTube's is hidden:
 * YouTube's player terms (Required Minimum Functionality) bar overlays and hidden branding, and the
 * owner won't risk the videos (2026-11-15). A tap on the picture is YouTube's own play/pause, which
 * the bar follows (`onChangeState`).
 */
function Frame({
  videoId,
  playback,
  width,
  height,
  warnOnYouTube,
}: {
  videoId: string;
  playback: VideoPlayback;
  /** Unmeasured (0): the frame takes its parent's width. */
  width: number;
  height: number;
  warnOnYouTube: boolean;
}) {
  const p = playback;
  const onYouTubeLink = (url: string) => {
    p.setPlaying(false);
    p.setFullScreen(false);
    confirmOpenYouTube(url, warnOnYouTube ? YOUTUBE_WARNING : YOUTUBE_PLAIN);
  };
  return (
    <View testID="video-frame" style={{ width: width > 0 ? width : undefined, height }} className="bg-black">
      <YoutubePlayer
        ref={p.playerRef}
        width={width > 0 ? width : undefined}
        height={height}
        videoId={videoId}
        // Play, pause and speed go by command (`playback.setPlaying`, `setRate`): the hosted page
        // drops the props' messages.
        play={false}
        baseUrlOverride={PLAYER_BASE_URL}
        webViewProps={youTubeLinkGuard(onYouTubeLink)}
        initialPlayerParams={{
          controls: false,
          modestbranding: true,
          rel: false,
          iv_load_policy: 3,
          // Full screen is the app's own (below), so the controls stay the app's there too.
          preventFullScreen: true,
        }}
        onReady={p.onReady}
        onError={() => p.setFailed(true)}
        onChangeState={p.onChangeState}
      />
    </View>
  );
}

/**
 * Full screen (owner, 2026-11-15): the same player, landscape, edge to edge, with the app's controls
 * under the picture. The frame is made again there and carries on from the playhead (`onReady`).
 */
function FullScreenPlayer({
  videoId,
  playback,
  warnOnYouTube,
}: {
  videoId: string;
  playback: VideoPlayback;
  warnOnYouTube: boolean;
}) {
  const p = playback;
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    // The <StatusBar hidden /> below alone didn't always take in the modal's window (UI sweep s61).
    setStatusBarHidden(true, "fade");
    return () => {
      setStatusBarHidden(false, "fade");
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, []);
  // 16:9, as large as fits over the controls.
  const height = Math.min(size.height, Math.round((size.width * 9) / 16));
  const width = Math.round((height * 16) / 9);
  return (
    <Modal
      visible
      animationType="fade"
      supportedOrientations={["landscape", "portrait"]}
      onRequestClose={() => p.setFullScreen(false)}
      statusBarTranslucent
    >
      {/* The clock and icons would sit on the picture (UI sweep s61, 2026-11-16). */}
      <StatusBar hidden />
      <SafeAreaView className="flex-1 bg-black" edges={["left", "right", "bottom"]}>
        <View
          className="flex-1 items-center justify-center"
          onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          {height > 0 ? (
            <Frame videoId={videoId} playback={p} width={width} height={height} warnOnYouTube={warnOnYouTube} />
          ) : null}
        </View>
        <VideoControls playback={p} />
      </SafeAreaView>
    </Modal>
  );
}

/**
 * The in-app player both video screens show (a session's video and an assignment's video part): the
 * YouTube frame with YouTube's controls off and the app's own under it (owner, 2026-11-15: "put our
 * own video player to control everything"; it replaces 2026-11-13's YouTube-only controls), never
 * autoplaying; or the deadlock notice when a question can't be reached. A seek goes through
 * `playback.seek`, so the bar can't pass the next unanswered question or, with skipping blocked, what
 * was watched. A question closes full screen, so its sheet shows over the screen as usual.
 */
export function VideoPlayerFrame({
  videoId,
  playback,
  onRetry,
  onLeave,
  leaveLabel,
  warnOnYouTube = true,
}: {
  videoId: string;
  playback: VideoPlayback;
  onRetry?: () => void;
  /** An explicit exit under the controls, when the screen has one (the session's "Leave the quiz"). */
  onLeave?: () => void;
  leaveLabel?: string;
  /** Warn that watching in YouTube doesn't count (false where watching isn't tracked). */
  warnOnYouTube?: boolean;
}) {
  const p = playback;
  const [width, setWidth] = useState(0);
  const { setFullScreen } = p;
  useEffect(() => {
    if (p.open !== null) setFullScreen(false);
  }, [p.open, setFullScreen]);

  if (p.deadlocked) {
    return (
      <InlineError
        className="rounded-group bg-surface dark:border dark:border-separator p-4"
        message={DEADLOCK}
        onRetry={() => onRetry?.()}
      />
    );
  }
  const height = videoHeight(width);
  return (
    <View
      className="overflow-hidden rounded-group border border-border bg-black"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {p.fullScreen ? (
        <>
          <View style={{ height }} className="bg-black" />
          <FullScreenPlayer videoId={videoId} playback={p} warnOnYouTube={warnOnYouTube} />
        </>
      ) : (
        <>
          <Frame videoId={videoId} playback={p} width={width} height={height} warnOnYouTube={warnOnYouTube} />
          <VideoControls playback={p} />
        </>
      )}
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
