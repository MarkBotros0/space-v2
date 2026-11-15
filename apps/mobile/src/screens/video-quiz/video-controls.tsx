/**
 * The app's own controls under (or, in full screen, over) a video (owner, 2026-11-15): the seek bar,
 * then play or pause, back 10 seconds, the time, the speed and full screen. YouTube's own controls are
 * off, so these are the only ones.
 */
import { Maximize, Minimize, Pause, Play, RotateCcw } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { formatTimestamp } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { Text } from "../../design/ui";
import { Pressable } from "../../design/ui/pressable";
import { nextSpeed, questionMarks, reachFraction, speedLabel } from "./player-model";
import type { VideoPlayback } from "./use-video-playback";
import { VideoScrubber } from "./video-scrubber";

iconWithClassName(Maximize, Minimize, Pause, Play, RotateCcw);

const BACK_SECONDS = 10;

function ControlButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="size-11 items-center justify-center rounded-full active:bg-white/10"
    >
      {children}
    </Pressable>
  );
}

export function VideoControls({ playback }: { playback: VideoPlayback }) {
  const p = playback;
  const limits = { ceiling: p.ceilingNow(), barrier: p.barrier, duration: p.duration, current: p.current };
  const time = `${formatTimestamp(Math.floor(p.current))} / ${p.duration === null ? "--:--" : formatTimestamp(Math.floor(p.duration))}`;
  return (
    <View className="flex-col bg-black px-2 pb-1">
      <View className="px-2">
        <VideoScrubber
          current={p.current}
          duration={p.duration}
          reach={reachFraction(limits)}
          marks={questionMarks(p.questions, p.duration)}
          onSeek={p.seek}
        />
      </View>
      <View className="flex-row items-center">
        <ControlButton label={p.playing ? "Pause" : "Play"} onPress={() => p.setPlaying((now) => !now)}>
          {p.playing ? (
            <Pause size={22} className="text-white" fill="white" />
          ) : (
            <Play size={22} className="text-white" fill="white" />
          )}
        </ControlButton>
        <ControlButton label="Back 10 seconds" onPress={() => p.seek(p.current - BACK_SECONDS)}>
          <RotateCcw size={20} className="text-white" />
        </ControlButton>
        <Text variant="caption" tabular numberOfLines={1} className="ml-1 min-w-0 flex-1 text-white">
          {time}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Speed ${speedLabel(p.rate)}`}
          accessibilityHint="Changes the playback speed"
          onPress={() => p.setRate(nextSpeed(p.rate))}
          className="h-11 min-w-11 items-center justify-center rounded-full px-2 active:bg-white/10"
        >
          <Text variant="subhead" tabular className="font-semibold text-white">
            {speedLabel(p.rate)}
          </Text>
        </Pressable>
        <ControlButton
          label={p.fullScreen ? "Exit full screen" : "Full screen"}
          onPress={() => p.setFullScreen((now) => !now)}
        >
          {p.fullScreen ? <Minimize size={20} className="text-white" /> : <Maximize size={20} className="text-white" />}
        </ControlButton>
      </View>
      {p.needsTap ? (
        <Text variant="caption" accessibilityLiveRegion="polite" className="px-2 pb-2 text-white/80">
          Tap the video to start it.
        </Text>
      ) : null}
    </View>
  );
}
