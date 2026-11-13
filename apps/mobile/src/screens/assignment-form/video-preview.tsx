/**
 * A video part's player for the author: the YouTube frame itself, with
 * YouTube's own controls, never autoplaying. Reports the length YouTube gives
 * once the player is ready (the part stores it, as `durationSeconds`). A
 * caller may move it (`handle`): the question form's time bar seeks it as the
 * author drags, and reads where the author paused it.
 */
import { type Ref, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import YoutubePlayer, { type YoutubeIframeRef } from "react-native-youtube-iframe";

import { videoHeight } from "../../design/lib/video-size";

export type VideoPreviewHandle = {
  /** `settled`: the drag ended, so the player may fetch ahead. */
  seekTo: (seconds: number, settled: boolean) => void;
  currentTime: () => Promise<number>;
};

export function VideoPreview({
  videoId,
  onDuration,
  handle,
}: {
  videoId: string;
  onDuration?: (seconds: number) => void;
  handle?: Ref<VideoPreviewHandle>;
}) {
  const playerRef = useRef<YoutubeIframeRef>(null);
  useImperativeHandle(handle, () => ({
    seekTo: (seconds, settled) => playerRef.current?.seekTo(seconds, settled),
    currentTime: () => playerRef.current?.getCurrentTime() ?? Promise.resolve(0),
  }));
  const [width, setWidth] = useState(0);
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
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <YoutubePlayer
        ref={playerRef}
        height={videoHeight(width)}
        videoId={videoId}
        play={false}
        initialPlayerParams={{ modestbranding: true, rel: false }}
        onReady={onReady}
      />
    </View>
  );
}
