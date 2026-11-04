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

function StatTile({
  value, suffix, label, className,
}: { value: number | string; suffix?: string; label: string; className?: string }) {
  const reduced = useReducedMotion();
  const shown = useCountUp(value, reduced);
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${suffix ?? ""}`} className={cn("flex-1 gap-0.5 rounded-2xl bg-surface p-4", className)}>
      <Text variant="largeTitle" tabular numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {`${shown}${suffix ?? ""}`}
      </Text>
      <Text variant="caption" numberOfLines={2} className="text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}

export { StatTile };
