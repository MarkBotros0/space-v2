import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { onlineManager } from "@tanstack/react-query";
import type { StudentQuizDetail } from "@space/shared";

import { Text } from "../../design/ui";
import { useStudentQuizDetail } from "../../hooks/use-quizzes";
import { clockOffsetMs } from "./countdown";
import { AttemptForm } from "./quiz-attempt-form";
import { quizTitleProps } from "./quiz-header";
import { ResultView } from "./quiz-result-view";
import { QuizStartCard } from "./quiz-start-card";
import type { TimeUpOutcome } from "./use-time-up";

/** Tries after the deadline before giving up on seeing the attempt closed (the server closes it on the read). */
const TIME_UP_READS = 3;
const TIME_UP_RETRY_MS = 2000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A fresh read of an open attempt whose deadline is still ahead on that read's own server clock. */
const timeLeftOnServer = (fresh: StudentQuizDetail) =>
  fresh.deadlineAt !== null && Date.parse(fresh.deadlineAt) > Date.parse(fresh.serverNow);

/** STUDENT: the start card, the attempt in progress, or the result. */
export function StudentRunner({ id }: { id: number }) {
  const { data, isPending, refetch, dataUpdatedAt } = useStudentQuizDetail(id);

  // Only a first read that failed is an error page. A re-read that fails keeps the data it had, so an
  // open attempt's form (and its time-up state) stays on screen rather than being swapped away.
  if (data === undefined) {
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

  /**
   * After the deadline: re-read until the server has closed the attempt. Only a successful read counts
   * (a failed one keeps the old data). Offline, a read would wait for the connection, so it reports
   * `unconfirmed` at once and the form retries when the phone is back online.
   */
  const readAfterDeadline = async (): Promise<TimeUpOutcome> => {
    for (let i = 0; i < TIME_UP_READS; i++) {
      if (!onlineManager.isOnline()) return "unconfirmed";
      if (i > 0) await wait(TIME_UP_RETRY_MS);
      const result = await refetch();
      if (!result.isSuccess) continue;
      if (result.data.stage !== "in_progress") return "closed";
      if (timeLeftOnServer(result.data)) return "open";
    }
    return "unconfirmed";
  };

  if (data.stage === "in_progress" && !awaitingStart) {
    return <AttemptForm detail={data} id={id} offsetMs={offsetMs} onTimeUp={readAfterDeadline} />;
  }
  if (finished) return <ResultView detail={data} />;
  return <QuizStartCard detail={data} id={id} offsetMs={offsetMs} reopened={awaitingStart} />;
}
