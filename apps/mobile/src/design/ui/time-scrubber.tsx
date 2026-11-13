/**
 * A time bar to pick a moment in a video: drag the thumb or tap the track, or use the step buttons
 * (dragging is never the only way). One adjustable control to a screen reader, stepping a second.
 * Domain-free: the caller seeks its own player from `onChange` / `onRelease`.
 */
import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";

import { clampSeconds, fractionOf, secondsAtX } from "../lib/scrub";
import { Button } from "./button";
import { Text } from "./text";

const STEPS = [
  { by: -10, label: "−10s", spoken: "Back 10 seconds" },
  { by: -1, label: "−1s", spoken: "Back 1 second" },
  { by: 1, label: "+1s", spoken: "Forward 1 second" },
  { by: 10, label: "+10s", spoken: "Forward 10 seconds" },
] as const;

export function TimeScrubber({
  label,
  value,
  max,
  format,
  onChange,
  onRelease,
}: {
  label: string;
  value: number;
  max: number;
  /** How a time reads ("2:30"). */
  format: (seconds: number) => string;
  /** Every move, while dragging too. */
  onChange: (seconds: number) => void;
  /** The drag or step settled on this time. */
  onRelease?: (seconds: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // The responder outlives renders: it reads the latest through refs.
  const latest = useRef({ width, max, onChange, onRelease, value });
  latest.current = { width, max, onChange, onRelease, value };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Inside a scroll view, a drag on the bar stays the bar's.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const l = latest.current;
        l.onChange(secondsAtX(e.nativeEvent.locationX, l.width, l.max));
      },
      onPanResponderMove: (e) => {
        const l = latest.current;
        l.onChange(secondsAtX(e.nativeEvent.locationX, l.width, l.max));
      },
      onPanResponderRelease: (e) => {
        const l = latest.current;
        const s = secondsAtX(e.nativeEvent.locationX, l.width, l.max);
        l.onChange(s);
        l.onRelease?.(s);
      },
    }),
  ).current;

  const step = (by: number) => {
    const next = clampSeconds(value + by, max);
    onChange(next);
    onRelease?.(next);
  };

  const pct = `${fractionOf(value, max) * 100}%` as const;
  return (
    <View className="flex-col gap-3">
      <View className="flex-row items-baseline justify-between">
        <Text variant="subhead" className="font-semibold">
          {label}
        </Text>
        <Text variant="title" tabular>
          {`${format(value)}`}
          <Text variant="subhead" className="text-muted-foreground">{` of ${format(max)}`}</Text>
        </Text>
      </View>
      <View
        testID="time-scrubber"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: `${format(value)} of ${format(max)}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        className="h-11 justify-center"
        {...responder.panHandlers}
      >
        <View pointerEvents="none" className="h-1.5 w-full overflow-hidden rounded-full bg-separator">
          <View className="h-full bg-primary" style={{ width: pct }} />
        </View>
        <View
          pointerEvents="none"
          className="absolute h-6 w-6 rounded-full border-2 border-primary bg-surface"
          style={{ left: pct, marginLeft: -12 }}
        />
      </View>
      <View className="flex-row gap-2">
        {STEPS.map((s) => (
          <Button
            key={s.by}
            variant="secondary"
            size="sm"
            className="flex-1 px-0"
            accessibilityLabel={s.spoken}
            onPress={() => step(s.by)}
          >
            {s.label}
          </Button>
        ))}
      </View>
    </View>
  );
}
