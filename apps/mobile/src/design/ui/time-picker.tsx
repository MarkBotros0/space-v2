/**
 * Port of v1 src/components/ui/time-picker.tsx — two Selects (hours 00–23,
 * minutes by minuteStep) separated by ":". Native differences: none beyond Select's.
 */
import { useMemo } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Text } from "./text";

const pad = (n: number) => n.toString().padStart(2, "0");

function TimePicker({
  value,
  onChange,
  className,
  disabled,
  minuteStep = 5,
}: {
  value: { hour: number; minute: number };
  onChange: (next: { hour: number; minute: number }) => void;
  className?: string;
  disabled?: boolean;
  minuteStep?: 5 | 10 | 15 | 30;
}) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep), [minuteStep]);
  return (
    <View className={cn("flex-row items-center gap-2", className)}>
      <Select value={pad(value.hour)} onValueChange={(v) => onChange({ ...value, hour: Number(v) })} disabled={disabled}>
        <SelectTrigger className="w-[88px]" accessibilityLabel="Hour">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {hours.map((h) => (
            <SelectItem key={h} value={pad(h)}>
              {pad(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Text className="text-muted-foreground">:</Text>
      <Select value={pad(value.minute)} onValueChange={(v) => onChange({ ...value, minute: Number(v) })} disabled={disabled}>
        <SelectTrigger className="w-[88px]" accessibilityLabel="Minute">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((m) => (
            <SelectItem key={m} value={pad(m)}>
              {pad(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </View>
  );
}

export { TimePicker };
