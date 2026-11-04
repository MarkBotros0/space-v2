import { useState } from "react";
import { View } from "react-native";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { Button as ButtonV1, Text as TextV1 } from "../../design/ui";
import { useStartAttempt, useStudentQuizDetail } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { AttemptForm } from "./quiz-attempt-form";
import { QuizHeader } from "./quiz-header";
import { ResultView } from "./quiz-result-view";

/** STUDENT: the start card, the attempt in progress, or the result. */
export function StudentRunner({ id }: { id: number }) {
  const { data, isPending, isError, refetch } = useStudentQuizDetail(id);
  const start = useStartAttempt(id);
  const [startError, setStartError] = useState<string | null>(null);

  if (isPending || isError) {
    return (
      <ShellFrame>
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </ShellFrame>
    );
  }

  if (data.status === "IN_PROGRESS") return <AttemptForm detail={data} id={id} />;
  if (data.status === "GRADED" || data.status === "SUBMITTED") return <ResultView detail={data} />;

  const n = data.questions.length;
  return (
    <ShellFrame>
      <View className="flex-col gap-3">
        <QuizHeader detail={data} />
        <View
          className="flex-col gap-3 rounded-[16px] bg-surface dark:border dark:border-separator p-5"
        >
          <TextV1 className="text-sm text-muted-foreground">
            {`${n} question${n === 1 ? "" : "s"} · ${data.maxScore} points. You have one attempt — answer every question before submitting.`}
          </TextV1>
          {/* The only thing that creates an attempt — never a render (ruling C6). */}
          <ButtonV1
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
          </ButtonV1>
          {startError ? <TextV1 className="text-xs text-error-600">{startError}</TextV1> : null}
        </View>
      </View>
    </ShellFrame>
  );
}
