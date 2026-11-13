import type { QuizGradingAttempt } from "@space/shared";
import { View } from "react-native";

import { Text } from "../../design/ui/text";
import { endReasonLine, exitLogLines, exitSummary } from "./exit-log-model";

/**
 * The attempt's exit log for staff (spec "Marking"), as its own card (owner, 2026-11-13 redesign):
 * how it ended and how often the student left on top, then each time they left, oldest first, on a
 * timeline. Durations are words ("back after 32 sec"), never a clock reading.
 */
export function ExitLog({ attempt }: { attempt: QuizGradingAttempt }) {
  const ended = endReasonLine(attempt.endReason, attempt.endedByName);
  const lines = exitLogLines(attempt.events, attempt.endReason, attempt.deadlineAt);
  return (
    <View className="flex-col gap-2 rounded-group bg-background p-4">
      <Text variant="headline">Exit log</Text>
      <Text variant="subhead" className="font-semibold">
        {exitSummary(attempt.events)}
      </Text>
      {ended ? (
        <Text variant="subhead" className="text-muted-foreground">
          {`How it ended: ${ended}`}
        </Text>
      ) : null}
      {lines.length > 0 ? (
        <View className="mt-1 flex-col gap-2 border-l-2 border-separator pl-3">
          {lines.map((line, i) => (
            <Text key={i} variant="subhead">
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
