/**
 * A video part's player for the author: the YouTube frame itself, with
 * YouTube's own controls, never autoplaying. Reports the length YouTube gives
 * once the player is ready (the part stores it, as `durationSeconds`).
 */
import { useRef } from "react";
import { View } from "react-native";
import YoutubePlayer, { type YoutubeIframeRef } from "react-native-youtube-iframe";

/** 16:9 on a 360dp phone inside a card's padding. */
const PLAYER_HEIGHT = 180;

export function VideoPreview({ videoId, onDuration }: { videoId: string; onDuration?: (seconds: number) => void }) {
  const playerRef = useRef<YoutubeIframeRef>(null);
  const onReady = () => {
    if (onDuration === undefined) return;
    void playerRef.current
      ?.getDuration()
      .then((d) => {
        if (Number.isFinite(d) && d > 0) onDuration(Math.round(d));
      })
      .catch(() => undefined);
  };
  return (
    <View
      testID="part-video-player"
      accessibilityLabel="Video preview"
      className="overflow-hidden rounded-control bg-black"
    >
      <YoutubePlayer
        ref={playerRef}
        height={PLAYER_HEIGHT}
        videoId={videoId}
        play={false}
        initialPlayerParams={{ modestbranding: true, rel: false }}
        onReady={onReady}
      />
    </View>
  );
}
