import type { QuizGradingAttempt } from "@space/shared";
import { View } from "react-native";

import { Text } from "../../design/ui/text";
import { endReasonLine, exitLogLines } from "./exit-log-model";

/** The attempt's exit log for staff (spec "Marking"): how it ended, then each time the student left. */
export function ExitLog({ attempt }: { attempt: QuizGradingAttempt }) {
  const ended = endReasonLine(attempt.endReason, attempt.endedByName);
  const lines = exitLogLines(attempt.events, attempt.endReason);
  return (
    <View className="flex-col gap-1.5">
      <Text variant="headline">Exit log</Text>
      {ended ? <Text variant="subhead">{ended}</Text> : null}
      {lines.length === 0 ? (
        <Text variant="subhead" className="text-muted-foreground">
          Never left the quiz
        </Text>
      ) : (
        lines.map((line, i) => (
          <Text key={i} variant="subhead" className="text-muted-foreground">
            {line}
          </Text>
        ))
      )}
    </View>
  );
}
