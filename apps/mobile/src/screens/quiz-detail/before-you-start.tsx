import { isSameDay } from "date-fns";
import { BellOff, CameraOff, DoorOpen, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { StudentQuizDetail } from "@space/shared";

import { iconWithClassName } from "../../design/lib/icon";
import { SaveBar } from "../../design/layout/save-bar";
import { Screen } from "../../design/layout/screen";
import { Text } from "../../design/ui";
import { useStartAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { formatSessionTime, formatShortDateTime } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";
import { MS_PER_HOUR } from "../../lib/time";
import { nextWindowChangeMs, serverTimeMs, startWindowState, type StartWindowState } from "./countdown";
import { useBackBlock } from "./lock/use-attempt-guards";
import { quizTitleProps } from "./quiz-header";

iconWithClassName(BellOff);
iconWithClassName(DoorOpen);
iconWithClassName(CameraOff);

/** What the student is asked and told before the attempt starts (spec "Before you start"). */
const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: BellOff, text: "Turn on Do Not Disturb or Focus." },
  { icon: DoorOpen, text: "Leaving the quiz is recorded. Leaving more than twice ends your attempt." },
  { icon: CameraOff, text: "Screenshots are blocked." },
];

/** "6:00 PM" today, "Nov 14, 6:00 PM" on another day. */
function windowTime(iso: string, serverNow: number): string {
  return isSameDay(new Date(iso), new Date(serverNow)) ? formatSessionTime(iso) : formatShortDateTime(iso);
}

function startLabel(state: StartWindowState, serverNow: number): string {
  if (state.kind === "not_yet") return `Opens at ${windowTime(state.at, serverNow)}`;
  if (state.kind === "closed") return `Starting closed at ${windowTime(state.at, serverNow)}`;
  return "I'm ready";
}

/** The time-limit line: the limit and what happens at zero, or that there is none. */
function timeLimitLine(limit: number | null): string {
  if (limit === null) return "No time limit.";
  return `You have ${plural(limit, "minute")} from when you start. When time runs out, your saved answers are submitted.`;
}

/** Re-renders when the start window next opens or closes (server time), so the button follows it. */
function useWindowTick(next: number | null, offsetMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (next === null) return;
    // Capped: a window days away re-checks hourly rather than overflow setTimeout's range.
    const wait = Math.min(Math.max(0, next - serverTimeMs(offsetMs, Date.now())), MS_PER_HOUR);
    const timer = setTimeout(() => setTick((n) => n + 1), wait);
    return () => clearTimeout(timer);
  }, [next, offsetMs]);
}

/**
 * Before the attempt: what the quiz holds, the time limit, what the student should do and what the
 * app watches, and "I'm ready", the one thing that starts it (ruling C6). The window limits a first
 * start only; a reopened attempt (`reopened`: timed, IN_PROGRESS, no deadline yet) is never blocked
 * by it, its clock begins on this tap, and the student is already held on it: no way back.
 */
export function BeforeYouStart({
  detail,
  id,
  offsetMs,
  reopened,
}: {
  detail: StudentQuizDetail;
  id: number;
  offsetMs: number;
  reopened: boolean;
}) {
  const start = useStartAttempt(id);
  const [startError, setStartError] = useState<string | null>(null);
  const serverNow = serverTimeMs(offsetMs, Date.now());
  const state: StartWindowState = reopened ? { kind: "open" } : startWindowState(detail, serverNow);
  useWindowTick(reopened ? null : nextWindowChangeMs(detail, serverNow), offsetMs);
  useBackBlock(reopened);

  const n = detail.questionCount;
  return (
    <Screen
      {...quizTitleProps(detail)}
      back={reopened ? null : undefined}
      footer={
        <SaveBar
          label={startLabel(state, serverNow)}
          loading={start.isPending}
          disabled={start.isPending || state.kind !== "open"}
          error={startError}
          onPress={() => {
            setStartError(null);
            start.mutate(undefined, {
              onError: (err) => setStartError(apiErrorMessage(err, "Couldn't start the quiz.")),
            });
          }}
        />
      }
    >
      <View className="flex-col gap-3 rounded-group bg-surface p-5">
        <Text variant="headline" accessibilityRole="header">
          Before you start
        </Text>
        <Text variant="subhead" className="text-muted-foreground">
          {`${joinMeta([plural(n, "question"), plural(detail.maxScore, "point")])}. You have one attempt. Answer every question before submitting.`}
        </Text>
        <Text variant="subhead" className="text-muted-foreground">
          {timeLimitLine(detail.timeLimitMinutes)}
        </Text>
        {POINTS.map(({ icon: Icon, text }) => (
          <View key={text} className="flex-row items-start gap-3">
            <Icon size={20} className="text-foreground" accessibilityElementsHidden importantForAccessibility="no" />
            <Text variant="body" className="min-w-0 flex-1">
              {text}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
