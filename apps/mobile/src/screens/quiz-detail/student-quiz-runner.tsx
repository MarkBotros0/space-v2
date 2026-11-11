import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { onlineManager } from "@tanstack/react-query";
import { useEffect } from "react";
import type { StudentQuizDetail } from "@space/shared";

import { Text } from "../../design/ui";
import { useStudentQuizDetail } from "../../hooks/use-quizzes";
import { BeforeYouStart } from "./before-you-start";
import { clockOffsetMs } from "./countdown";
import { forgetAttempt } from "./lock/exit-queue";
import { AttemptForm } from "./quiz-attempt-form";
import { quizTitleProps } from "./quiz-header";
import { ResultView } from "./quiz-result-view";
import type { TimeUpOutcome } from "./use-time-up";
import { apiErrorStatus } from "../../lib/api-error";
import { useQuizLockStore } from "../../store/quiz-lock";

/** Tries after the deadline before giving up on seeing the attempt closed (the server closes it on the read). */
const TIME_UP_READS = 3;
const TIME_UP_RETRY_MS = 2000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A fresh read of an open attempt whose deadline is still ahead on that read's own server clock. */
const timeLeftOnServer = (fresh: StudentQuizDetail) =>
  fresh.deadlineAt !== null && Date.parse(fresh.deadlineAt) > Date.parse(fresh.serverNow);

/** A read that says this quiz is gone for the student (unpublished, season deleted, place lost). */
const isGone = (err: unknown) => {
  const status = apiErrorStatus(err);
  return status === 404 || status === 403;
};

/** Open (hold), closed or gone (let go), or null when the latest read failed for another reason (no change). */
function holdsOpen(data: StudentQuizDetail | undefined, failure: unknown): boolean | null {
  if (failure !== null) return isGone(failure) ? false : null;
  if (data === undefined) return null;
  return data.stage === "in_progress" && !data.readOnly;
}

/**
 * Hold the student on this quiz while its current read shows the attempt open (a reopened one
 * awaiting its start too), and let go once it shows it closed: submitted, timed out or ended. A
 * finished season's open attempt can't be worked on, so it holds nothing; nor does a quiz whose read
 * now says it is gone. Only a read newer than any failure holds: React Query keeps the last data
 * after a failed re-read, and that stale "open" must not trap the student on a dead form.
 * Re-asserted if a stale server read let go.
 */
function useHoldWhileOpen(id: number, query: ReturnType<typeof useStudentQuizDetail>) {
  const lockedQuizId = useQuizLockStore((s) => s.lockedQuizId);
  const { data, error, dataUpdatedAt, errorUpdatedAt } = query;
  const open = holdsOpen(data, error !== null && errorUpdatedAt >= dataUpdatedAt ? error : null);
  useEffect(() => {
    if (open === null) return;
    const { setLockedQuiz } = useQuizLockStore.getState();
    if (open && lockedQuizId !== id) setLockedQuiz(id);
    if (!open && lockedQuizId === id) setLockedQuiz(null);
  }, [id, open, lockedQuizId]);
  return lockedQuizId === id;
}

/** STUDENT: before you start, the attempt in progress, or the result. */
export function StudentRunner({ id }: { id: number }) {
  const query = useStudentQuizDetail(id);
  const { data, isPending, refetch, dataUpdatedAt } = query;

  // A finished attempt keeps nothing on the phone: its unsent exits can no longer count.
  const finishedAttemptId = data !== undefined && data.stage !== "in_progress" ? data.attemptId : null;
  useEffect(() => {
    if (finishedAttemptId !== null) void forgetAttempt(finishedAttemptId);
  }, [finishedAttemptId]);

  const held = useHoldWhileOpen(id, query);

  // Only a first read that failed is an error page. A re-read that fails keeps the data it had, so an
  // open attempt's form (and its time-up state) stays on screen rather than being swapped away.
  if (data === undefined) {
    return (
      <Screen back={held ? null : undefined}>
        {isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void refetch()} />}
      </Screen>
    );
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
  return <BeforeYouStart detail={data} id={id} offsetMs={offsetMs} reopened={awaitingStart} />;
}
