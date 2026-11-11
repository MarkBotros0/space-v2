import { useState } from "react";
import { View } from "react-native";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button, Text } from "../../design/ui";
import { useStartAttempt, useStudentQuizDetail } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { AttemptForm } from "./quiz-attempt-form";
import { quizTitleProps } from "./quiz-header";
import { ResultView } from "./quiz-result-view";

/** STUDENT: the start card, the attempt in progress, or the result. */
export function StudentRunner({ id }: { id: number }) {
  const { data, isPending, isError, refetch } = useStudentQuizDetail(id);
  const start = useStartAttempt(id);
  const [startError, setStartError] = useState<string | null>(null);

  if (isPending || isError) {
    return <Screen>{isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}</Screen>;
  }

  const finished = data.stage === "submitted" || data.stage === "graded" || data.stage === "answers";
  if (data.readOnly && !finished) {
    // A finished season: nothing to start, and an attempt left open can't be resumed.
    return (
      <Screen {...quizTitleProps(data)}>
        <Text variant="subhead" className="rounded-group bg-surface p-5 text-muted-foreground">
          {data.stage === "in_progress" ? "You didn't finish this quiz." : "You didn't take this quiz."}
        </Text>
      </Screen>
    );
  }
  if (data.stage === "in_progress") return <AttemptForm detail={data} id={id} />;
  if (finished) return <ResultView detail={data} />;

  // No questions are sent before the start; the count comes on its own.
  const n = data.questionCount;
  return (
    <Screen {...quizTitleProps(data)}>
      <View className="flex-col gap-3">
        <View className="flex-col gap-3 rounded-group bg-surface p-5">
          <Text variant="subhead" className="text-muted-foreground">
            {`${n} question${n === 1 ? "" : "s"} · ${data.maxScore} points. You have one attempt — answer every question before submitting.`}
          </Text>
          {/* The only thing that creates an attempt — never a render (ruling C6). */}
          <Button
            className="self-start"
            disabled={start.isPending}
            onPress={() => {
              setStartError(null);
              start.mutate(undefined, {
                onError: (err) => setStartError(apiErrorMessage(err, "Couldn't start the quiz.")),
              });
            }}
          >
            {start.isPending ? "Starting…" : "Start quiz"}
          </Button>
          {startError ? (
            <Text variant="caption" className="text-bad">
              {startError}
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
