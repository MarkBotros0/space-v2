import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import { SafeAreaView } from "react-native-safe-area-context";

import { InlineError } from "../../design/layout/route-states";
import { videoHeight } from "../../design/lib/video-size";
import { Button } from "../../design/ui";
import { Pressable } from "../../design/ui/pressable";
import type { VideoPlayback } from "./use-video-playback";
import { VideoControls } from "./video-controls";
import { confirmOpenYouTube, PLAYER_BASE_URL, youTubeLinkGuard } from "./youtube-link-guard";

const DEADLOCK = "A question on this video is set past the end of the recording. Ask your leader to fix it.";

/** What the student is told before a YouTube link leaves the app's player (owner, 2026-11-15). */
const YOUTUBE_WARNING = "Watching in YouTube doesn't count toward your progress here. Come back to the app to finish.";
const YOUTUBE_PLAIN = "This opens the video in the YouTube app.";

/**
 * YouTube's logo stays uncovered, bottom right, as YouTube's terms ask; a tap on it asks first
 * (`youtube-link-guard.ts`).
 */
const LOGO_HOLE = { width: 96, height: 44 };

/**
 * While the video plays, a tap on the picture is the app's and pauses it. While it is stopped the
 * picture is YouTube's: its own big play button starts it, which a phone always allows, where a Play
 * sent from the app can be refused (owner, 2026-11-15: "the video is stuck").
 */
function TapShield({ playback, height }: { playback: VideoPlayback; height: number }) {
  const p = playback;
  if (!p.playing) return null;
  const pause = () => p.setPlaying(false);
  return (
    <>
      {/* The bar's Pause is the one a screen reader finds; the picture is a second, bigger target. */}
      <Pressable
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onPress={pause}
        className="absolute inset-x-0 top-0"
        style={{ height: Math.max(0, height - LOGO_HOLE.height) }}
      />
      <Pressable
        accessible={false}
        onPress={pause}
        className="absolute bottom-0 left-0"
        style={{ height: LOGO_HOLE.height, right: LOGO_HOLE.width }}
      />
    </>
  );
}

/** The YouTube frame with its own controls off, and the shield that keeps taps for the app. */
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
    <View style={{ width: width > 0 ? width : undefined, height }} className="bg-black">
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
      <TapShield playback={p} height={height} />
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
    return () => {
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
