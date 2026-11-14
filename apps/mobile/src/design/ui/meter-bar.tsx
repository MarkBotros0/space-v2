/**
 * The thin bar under a figure: a hairline-coloured track with a fill to `pct` percent (clamped to
 * 0–100), or no fill when there is nothing to count. Decorative: the figure beside it carries the
 * number, so the bar is not its own accessible element. The fill's colour and shape come from the
 * caller (a result meter's band, Organisation's rounded primary bar).
 */
import { View } from "react-native";

import { cn } from "../lib/cn";

export function MeterBar({ pct, fillClassName }: { pct: number | null; fillClassName: string }) {
  return (
    <View className="h-1.5 w-full overflow-hidden rounded-full bg-separator">
      {pct === null ? null : (
        <View className={cn("h-full", fillClassName)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      )}
    </View>
  );
}
