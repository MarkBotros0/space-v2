import { View } from "react-native";

import { useTheme } from "../theme";
import { Button, Text } from "../ui";
import { ChoiceChips } from "./ChoiceChips";

export const MINUTE_STEP = 15;

const MINUTES = [0, 15, 30, 45] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:mm" -> parts, or null when it is not a clock time. */
export function parseClock(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * Start-time picker on a 15-minute grid (v1's `<TimePicker minuteStep={15}>`):
 * an hour stepper plus the four quarter-hour minutes. Value is org wall-clock
 * "HH:mm" (X13). A stored time that is off the grid (e.g. 18:10) is shown as-is
 * and kept until the user picks a minute or moves the hour.
 */
export function TimePicker({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  const theme = useTheme();
  const clock = parseClock(value) ?? { hour: 18, minute: 0 };
  const shiftHour = (delta: number) => onChange(`${pad((clock.hour + delta + 24) % 24)}:${pad(clock.minute)}`);
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" color={theme.colors.neutral[700]}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
        <Button title="−" variant="ghost" accessibilityLabel="Earlier hour" onPress={() => shiftHour(-1)} />
        <Text variant="heading" accessibilityLabel={`${label} ${pad(clock.hour)}:${pad(clock.minute)}`}>
          {`${pad(clock.hour)}:${pad(clock.minute)}`}
        </Text>
        <Button title="+" variant="ghost" accessibilityLabel="Later hour" onPress={() => shiftHour(1)} />
      </View>
      <ChoiceChips
        label="Minutes"
        options={MINUTES.map((m) => ({ value: m, label: pad(m) }))}
        value={clock.minute}
        onChange={(m) => onChange(`${pad(clock.hour)}:${pad(m)}`)}
      />
      {error ? <Text variant="caption" color={theme.colors.error[600]}>{error}</Text> : null}
    </View>
  );
}
