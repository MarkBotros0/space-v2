import { Lock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { formatTimestamp, type StudentVideoQuestion } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Text } from "../../design/ui";

iconWithClassName(Lock);

/**
 * The player's seek track: played fill, the locked span past the barrier, a
 * dot per question, then the clock and the "Answer to unlock" cue. A tap
 * reports where on the track it landed, 0–1; clamping to the barrier is the
 * player's job.
 */
export function VideoProgressTrack({
  questions,
  current,
  total,
  barrier,
  onSeek,
}: {
  questions: StudentVideoQuestion[];
  current: number;
  total: number;
  barrier: number;
  onSeek: (fraction: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const playedPct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const lockedFrom = total > 0 && Number.isFinite(barrier) ? Math.min(100, (barrier / total) * 100) : 100;

  return (
    <>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Video progress"
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (trackWidth <= 0) return;
          onSeek(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth)));
        }}
        className="h-6 justify-center"
      >
        <View className="h-1.5 w-full rounded-full bg-white/20">
          {lockedFrom < 100 ? (
            <View
              className="absolute bottom-0 right-0 top-0 rounded-r-full bg-white/5"
              style={{ left: `${lockedFrom}%` }}
            />
          ) : null}
          <View
            className="absolute bottom-0 left-0 top-0 rounded-full bg-brand-teal-500"
            style={{ width: `${playedPct}%` }}
          />
          {total > 0
            ? questions.map((q) => (
                <View
                  key={q.id}
                  className={cn("absolute size-2 rounded-full", q.answered ? "bg-success-500" : "bg-warning-400")}
                  style={{
                    left: `${Math.min(100, (q.atSeconds / total) * 100)}%`,
                    top: -1,
                    marginLeft: -4,
                  }}
                />
              ))
            : null}
        </View>
      </Pressable>
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-caption font-medium text-white/70">
          {`${formatTimestamp(current)} / ${formatTimestamp(total)}`}
        </Text>
        {Number.isFinite(barrier) && barrier < total ? (
          <View className="flex-row items-center gap-1">
            <Lock size={12} className="text-white/70" />
            <Text className="text-caption font-medium text-white/70">Answer to unlock</Text>
          </View>
        ) : null}
      </View>
    </>
  );
}
