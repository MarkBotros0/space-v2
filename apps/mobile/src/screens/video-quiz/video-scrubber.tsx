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

/** Movement under this many points is a tap, whichever way it drifted. */
const TAP_SLOP = 10;

/** A gesture that moved mostly up or down, past a tap's drift. */
export const isVerticalSwipe = (dx: number, dy: number): boolean =>
  Math.abs(dy) > TAP_SLOP && Math.abs(dy) > Math.abs(dx);

const pctOf = (f: number) => `${Math.min(1, Math.max(0, f)) * 100}%` as const;

export function VideoScrubber({
  current,
  duration,
  reach,
  marks,
  onSeek,
  disabled: off = false,
}: {
  current: number;
  duration: number | null;
  /** How far a seek may go, 0..1 of the video (`reachFraction`). */
  reach: number;
  /** Unanswered questions, 0..1 along the video (`questionMarks`). */
  marks: { id: number; at: number }[];
  /** A drag or tap settled here; the player clamps it (`clampSeek`). */
  onSeek: (seconds: number) => void;
  /** Not now (an ad is playing). */
  disabled?: boolean;
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
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
      // A sideways drag stays the bar's; an up-and-down one is the page scrolling, which takes it
      // over and seeks nothing (onPanResponderTerminate). UI sweep s61, 2026-11-16: a scroll that
      // started on the bar moved the video.
      onPanResponderTerminationRequest: (_e, g) => Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: (e) => setDragAt(at(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setDragAt(at(e.nativeEvent.locationX)),
      onPanResponderRelease: (e, g) => {
        setDragAt(null);
        // An up-and-down swipe that began on the bar was meant for the page, even where the page
        // has nothing to scroll: it seeks nothing (UI sweep s61, 2026-11-16).
        if (isVerticalSwipe(g.dx, g.dy)) return;
        latest.current.onSeek(at(e.nativeEvent.locationX));
      },
      onPanResponderTerminate: () => setDragAt(null),
    }),
  ).current;

  const shown = dragAt ?? current;
  const played = pctOf(fractionOf(shown, max));
  const disabled = off || max <= 0;
  return (
    <View
      testID="video-scrubber"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Video position"
      accessibilityState={{ disabled }}
      accessibilityValue={{ text: `${formatTimestamp(Math.floor(shown))} of ${formatTimestamp(Math.floor(max))}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        if (disabled) return;
        onSeek(current + (e.nativeEvent.actionName === "increment" ? STEP_SECONDS : -STEP_SECONDS));
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className="h-11 justify-center"
      {...(disabled ? {} : responder.panHandlers)}
    >
      <View pointerEvents="none" className="h-1 w-full overflow-hidden rounded-full bg-white/20">
        <View className="absolute inset-y-0 left-0 bg-white/40" style={{ width: pctOf(reach) }} />
        {/* The bar is black in either theme, so the played part is white, not the theme's primary
            (navy in light, which vanished on the black: UI sweep s61, 2026-11-16). */}
        <View className="absolute inset-y-0 left-0 bg-white" style={{ width: played }} />
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
