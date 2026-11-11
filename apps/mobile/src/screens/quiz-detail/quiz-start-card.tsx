import { isSameDay } from "date-fns";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { StudentQuizDetail } from "@space/shared";

import { Screen } from "../../design/layout/screen";
import { Button, Text } from "../../design/ui";
import { useStartAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { formatSessionTime, formatShortDateTime } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";
import { MS_PER_HOUR } from "../../lib/time";
import { nextWindowChangeMs, serverTimeMs, startWindowState, type StartWindowState } from "./countdown";
import { quizTitleProps } from "./quiz-header";

/** "6:00 PM" today, "Nov 14, 6:00 PM" on another day. */
function windowTime(iso: string, serverNow: number): string {
  return isSameDay(new Date(iso), new Date(serverNow)) ? formatSessionTime(iso) : formatShortDateTime(iso);
}

function startLabel(state: StartWindowState, limit: number | null, serverNow: number): string {
  if (state.kind === "not_yet") return `Opens at ${windowTime(state.at, serverNow)}`;
  if (state.kind === "closed") return `Starting closed at ${windowTime(state.at, serverNow)}`;
  return limit === null ? "Start quiz" : joinMeta(["Start quiz", plural(limit, "minute")]);
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
 * Before the attempt: what the quiz holds, and the one button that starts it (ruling C6). The
 * window limits a first start only; a reopened attempt (`reopened`: timed, IN_PROGRESS, no deadline
 * yet) is never blocked by it, and its clock begins on this tap (docs/rules/quiz-integrity.md).
 */
export function QuizStartCard({
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

  const n = detail.questionCount;
  const limit = detail.timeLimitMinutes;
  return (
    <Screen {...quizTitleProps(detail)}>
      <View className="flex-col gap-3 rounded-group bg-surface p-5">
        <Text variant="subhead" className="text-muted-foreground">
          {`${n} question${n === 1 ? "" : "s"} · ${detail.maxScore} points. You have one attempt — answer every question before submitting.`}
        </Text>
        {limit !== null ? (
          <Text variant="subhead" className="text-muted-foreground">
            {`You have ${plural(limit, "minute")} from when you start. When time runs out, your saved answers are submitted.`}
          </Text>
        ) : null}
        {/* The only thing that creates an attempt — never a render (ruling C6). */}
        <Button
          className="self-start"
          disabled={start.isPending || state.kind !== "open"}
          onPress={() => {
            setStartError(null);
            start.mutate(undefined, {
              onError: (err) => setStartError(apiErrorMessage(err, "Couldn't start the quiz.")),
            });
          }}
        >
          {start.isPending ? "Starting…" : startLabel(state, limit, serverNow)}
        </Button>
        {startError ? (
          <Text variant="caption" className="text-bad">
            {startError}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
