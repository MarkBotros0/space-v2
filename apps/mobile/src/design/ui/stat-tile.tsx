import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { DURATION, useReducedMotion, usePressScale } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

const FRAME_MS = 16;

/**
 * Eases the shown number to `target` over DURATION.slow: from 0 on first
 * mount, from wherever it is on a change. A refetch that brings the same
 * number back (even after a string placeholder in between) shows it at once
 * instead of counting up again; reduced motion always shows `target` at once.
 */
function useCountUp(target: number | string, reduced: boolean): number | string {
  const [shown, setShown] = useState<number | string>(reduced || typeof target === "string" ? target : 0);
  // The last number on screen, so a change or a refetch starts from it, not from 0.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (typeof target === "string") {
      setShown(target);
      return;
    }
    const from = last.current ?? 0;
    if (reduced || from === target) {
      last.current = target;
      setShown(target);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION.slow);
      const value = t >= 1 ? target : Math.round(from + (target - from) * (1 - (1 - t) ** 3));
      last.current = value;
      setShown(value);
      if (t >= 1) clearInterval(id);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [target, reduced]);
  return shown;
}

/**
 * A figure and its label. The value is a count/score, so it is never
 * ellipsized: it shrinks to fit one line. The label takes two lines and
 * shrinks before it would need a third; its font scale is capped. The tile's
 * minimum width keeps the longest label word ("assignments" at 1.3x) whole:
 * Android breaks a word mid-word when it does not fit a line, and shrinking
 * cannot stop that because the broken word still fits two lines. A row of
 * tiles should `flex-wrap` so they drop to two columns instead of squeezing.
 * With `onPress` the tile is a button with the press scale; without it, a plain view.
 */
function StatTile({
  value, suffix, label, className, onPress,
}: { value: number | string; suffix?: string; label: string; className?: string; onPress?: () => void }) {
  const reduced = useReducedMotion();
  const press = usePressScale(0.97);
  const shown = useCountUp(value, reduced);
  const a11yLabel = `${label}: ${value}${suffix ?? ""}`;
  const body = (
    <>
      <Text variant="largeTitle" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} maxFontSizeMultiplier={1.3}>
        {`${shown}${suffix ?? ""}`}
      </Text>
      <Text
        variant="caption"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.3}
        className="text-muted-foreground"
      >
        {label}
      </Text>
    </>
  );
  const look = cn("gap-0.5 rounded-group bg-surface p-4", className);
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={a11yLabel} className={cn("min-w-[136px] flex-1", look)}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-w-[136px] flex-1"
    >
      <Animated.View style={press.animatedStyle}>
        <View className={look}>{body}</View>
      </Animated.View>
    </Pressable>
  );
}

export { StatTile };
