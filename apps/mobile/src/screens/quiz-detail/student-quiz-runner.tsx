import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Text } from "../../design/ui";
import { useStudentQuizDetail } from "../../hooks/use-quizzes";
import { clockOffsetMs } from "./countdown";
import { AttemptForm } from "./quiz-attempt-form";
import { quizTitleProps } from "./quiz-header";
import { ResultView } from "./quiz-result-view";
import { QuizStartCard } from "./quiz-start-card";

/** Tries after the deadline before giving up on seeing the attempt closed (the server closes it on the read). */
const TIME_UP_READS = 3;
const TIME_UP_RETRY_MS = 2000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** STUDENT: the start card, the attempt in progress, or the result. */
export function StudentRunner({ id }: { id: number }) {
  const { data, isPending, isError, refetch, dataUpdatedAt } = useStudentQuizDetail(id);

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

  // The countdown reads the server's clock: `serverNow` against when this response arrived.
  const offsetMs = clockOffsetMs(data.serverNow, dataUpdatedAt);
  // A reopened timed attempt is open but not started: its clock begins on the start tap.
  const awaitingStart = data.stage === "in_progress" && data.timeLimitMinutes !== null && data.deadlineAt === null;

  /** After the deadline: re-read until the server has closed the attempt; true once it has. */
  const readClosed = async (): Promise<boolean> => {
    for (let i = 0; i < TIME_UP_READS; i++) {
      if (i > 0) await wait(TIME_UP_RETRY_MS);
      const result = await refetch();
      if (result.data && result.data.stage !== "in_progress") return true;
    }
    return false;
  };

  if (data.stage === "in_progress" && !awaitingStart) {
    return <AttemptForm detail={data} id={id} offsetMs={offsetMs} onTimeUp={readClosed} />;
  }
  if (finished) return <ResultView detail={data} />;
  return <QuizStartCard detail={data} id={id} offsetMs={offsetMs} reopened={awaitingStart} />;
}
