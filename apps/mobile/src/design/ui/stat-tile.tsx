import { useEffect, useState } from "react";
import { View } from "react-native";

import { DURATION, useReducedMotion } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

const FRAME_MS = 16;

/** Eases a number from 0 to `target` over DURATION.slow; returns `target` at once when reduced. */
function useCountUp(target: number | string, reduced: boolean): number | string {
  const [shown, setShown] = useState<number | string>(reduced || typeof target === "string" ? target : 0);
  useEffect(() => {
    if (reduced || typeof target === "string") {
      setShown(target);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION.slow);
      setShown(t >= 1 ? target : Math.round(target * (1 - (1 - t) ** 3)));
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
 */
function StatTile({
  value, suffix, label, className,
}: { value: number | string; suffix?: string; label: string; className?: string }) {
  const reduced = useReducedMotion();
  const shown = useCountUp(value, reduced);
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${suffix ?? ""}`} className={cn("min-w-[136px] flex-1 gap-0.5 rounded-[16px] bg-surface p-4", className)}>
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
    </View>
  );
}

export { StatTile };
