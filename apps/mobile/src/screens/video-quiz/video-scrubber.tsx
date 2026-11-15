/**
 * The app's own seek bar under a video (owner, 2026-11-15): drag the thumb or tap the track. The
 * played part is filled, the part the student may still move to is lighter, and what lies past the
 * next unanswered question (or, with skipping blocked, past what was watched) stays dark, since a
 * seek there stops at the limit. Each unanswered question is a dot on the track.
 */
import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { formatTimestamp } from "@space/shared";

import { fractionOf } from "../../design/lib/scrub";

/** The bar's screen-reader steps, and the back button's. */
const STEP_SECONDS = 10;

const pctOf = (f: number) => `${Math.min(1, Math.max(0, f)) * 100}%` as const;

export function VideoScrubber({
  current,
  duration,
  reach,
  marks,
  onSeek,
}: {
  current: number;
  duration: number | null;
  /** How far a seek may go, 0..1 of the video (`reachFraction`). */
  reach: number;
  /** Unanswered questions, 0..1 along the video (`questionMarks`). */
  marks: { id: number; at: number }[];
  /** A drag or tap settled here; the player clamps it (`clampSeek`). */
  onSeek: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // Where the thumb is held while dragging; the playhead otherwise.
  const [dragAt, setDragAt] = useState<number | null>(null);
  const max = duration ?? 0;
  const latest = useRef({ width, max, reach, onSeek });
  latest.current = { width, max, reach, onSeek };

  /** The second under a touch, never past what a seek may reach, so the thumb shows where it will land. */
  const at = (x: number): number => {
    const l = latest.current;
    if (l.width <= 0 || l.max <= 0) return 0;
    return Math.min(Math.max(0, x / l.width), l.reach) * l.max;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Inside a scroll view, a drag on the bar stays the bar's.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setDragAt(at(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setDragAt(at(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        setDragAt(null);
        latest.current.onSeek(at(e.nativeEvent.locationX));
      },
      onPanResponderTerminate: () => setDragAt(null),
    }),
  ).current;

  const shown = dragAt ?? current;
  const played = pctOf(fractionOf(shown, max));
  const disabled = max <= 0;
  return (
    <View
      testID="video-scrubber"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Video position"
      accessibilityState={{ disabled }}
      accessibilityValue={{ text: `${formatTimestamp(Math.floor(shown))} of ${formatTimestamp(Math.floor(max))}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        onSeek(current + (e.nativeEvent.actionName === "increment" ? STEP_SECONDS : -STEP_SECONDS))
      }
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className="h-11 justify-center"
      {...(disabled ? {} : responder.panHandlers)}
    >
      <View pointerEvents="none" className="h-1 w-full overflow-hidden rounded-full bg-white/20">
        <View className="absolute inset-y-0 left-0 bg-white/40" style={{ width: pctOf(reach) }} />
        <View className="absolute inset-y-0 left-0 bg-primary" style={{ width: played }} />
      </View>
      {marks.map((m) => (
        <View
          key={m.id}
          testID="video-question-mark"
          pointerEvents="none"
          className="absolute size-2.5 rounded-full border border-black bg-warn"
          style={{ left: pctOf(m.at), marginLeft: -5 }}
        />
      ))}
      {disabled ? null : (
        <View
          pointerEvents="none"
          className="absolute size-4 rounded-full bg-white"
          style={{ left: played, marginLeft: -8 }}
        />
      )}
    </View>
  );
}
