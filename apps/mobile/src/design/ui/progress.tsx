/**
 * Port of v1 src/components/ui/progress.tsx (Base UI Progress).
 * Native differences: transition-[width] dropped; the value text is the raw
 * number, as v1's default formatter renders it.
 */
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

function Progress({ className, value, label, showValue }: { className?: string; value: number | null; label?: string; showValue?: boolean }) {
  const now = Math.max(0, Math.min(100, value ?? 0));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now }}
      className={cn("flex-col gap-1.5", className)}
    >
      {label || showValue ? (
        <View className="flex-row items-center justify-between">
          {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : <View />}
          {showValue ? <Text className="text-sm text-muted-foreground tabular-nums">{`${value ?? 0}`}</Text> : null}
        </View>
      ) : null}
      <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <View className="h-full bg-brand-teal-500" style={{ width: `${now}%` }} />
      </View>
    </View>
  );
}

export { Progress };
