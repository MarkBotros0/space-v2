import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { StatusChip } from "../../design/ui/status-chip";
import { formatRemaining, minutesLeftLabel, remainingMs } from "./countdown";

const TICK_MS = 1000;
/** Under a minute the chip turns `bad`; its text keeps saying the time, so colour is never alone. */
const LAST_MINUTE_MS = 60_000;

/**
 * The time left on a timed attempt, `m:ss`, in the screen's pinned bar so it stays in view while the
 * student scrolls (owner, 2026-11-11). No motion: the digits change in place (docs/rules/motion.md),
 * and there are no warnings at five or one minutes (owner). A screen reader hears whole minutes
 * from a polite live region, once a minute rather than every second. `onExpire` runs once at zero, and again only if time came back first.
 */
export function QuizCountdown({
  deadlineAt,
  offsetMs,
  onExpire,
}: {
  deadlineAt: string;
  offsetMs: number;
  onExpire: () => void;
}) {
  const left = () => remainingMs(deadlineAt, offsetMs, Date.now());
  const [ms, setMs] = useState(left);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const check = () => {
      const next = remainingMs(deadlineAt, offsetMs, Date.now());
      setMs(next);
      // Time left again (a fresh read corrected the offset after the phone's clock jumped): re-arm.
      if (next > 0) expired.current = false;
      if (next === 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current();
      }
    };
    check();
    const timer = setInterval(check, TICK_MS);
    return () => clearInterval(timer);
  }, [deadlineAt, offsetMs]);

  return (
    <View
      testID="quiz-countdown"
      accessible
      accessibilityRole="timer"
      accessibilityLabel={minutesLeftLabel(ms)}
      accessibilityLiveRegion="polite"
    >
      <StatusChip tone={ms < LAST_MINUTE_MS ? "bad" : "neutral"} label={formatRemaining(ms)} />
    </View>
  );
}
