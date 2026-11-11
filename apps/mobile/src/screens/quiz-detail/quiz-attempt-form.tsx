import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { QuizQuestionStudent, StudentQuizDetail } from "@space/shared";

import { Screen } from "../../design/layout/screen";
import { SaveBar } from "../../design/layout/save-bar";
import { Badge, ConfirmDialog, Text } from "../../design/ui";
import { useSubmitAttempt } from "../../hooks/use-quizzes";
import { apiErrorCode, apiErrorMessage } from "../../lib/api-error";
import { useIsOnline } from "../../lib/online";
import { reportOutcome } from "../../lib/outcome";
import { isAnswered, type DraftAnswer } from "./answer-model";
import { ExitWarning } from "./lock/exit-warning";
import { useQuizLock } from "./lock/use-quiz-lock";
import { QuestionInput, questionTypeLabel } from "./questions";
import { QuizCountdown } from "./quiz-countdown";
import { QCARD, quizTitleProps } from "./quiz-header";
import { useQuizAnswers } from "./use-quiz-answers";
import { useTimeUp, type TimeUpOutcome } from "./use-time-up";

const SUBMIT_FAILED = "Couldn't submit the quiz. Check your connection and try again.";
const CLOSING = "Time's up. Submitting your answers…";
const UNCONFIRMED = "Time's up. Couldn't confirm the submission yet.";
/** Staff ended it, or the server's clock ran out first; the screen moves to the result. */
const ENDED = "This attempt has ended.";

/** The autosave state, as the bar's hint says it; nothing before the first edit. */
function saveLabelFor(saveState: "idle" | "saving" | "saved" | "error", online: boolean): string | null {
  if (saveState === "saving") return online ? "Saving…" : "Waiting for connection";
  if (saveState === "saved") return "Saved";
  return saveState === "error" ? "Not saved" : null;
}

/** One question of the attempt: its number, type and points, then the input for its type. */
function AttemptQuestion({
  q,
  index,
  answer,
  onChange,
  disabled,
}: {
  q: QuizQuestionStudent;
  index: number;
  answer: DraftAnswer | undefined;
  onChange: (next: DraftAnswer) => void;
  disabled: boolean;
}) {
  return (
    <View className={QCARD}>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="caption" className="font-bold text-muted-foreground">{`Q${index + 1}`}</Text>
        <Badge variant={q.type === "ESSAY" ? "outline" : "teal"}>{questionTypeLabel(q)}</Badge>
        <Text variant="caption" className="text-muted-foreground">{`${q.points} pt${q.points === 1 ? "" : "s"}`}</Text>
      </View>
      <QuestionInput question={q} index={index} answer={answer} onChange={onChange} disabled={disabled} />
    </View>
  );
}

export function AttemptForm({
  detail,
  id,
  offsetMs,
  onTimeUp,
}: {
  detail: StudentQuizDetail;
  id: number;
  /** The server's clock minus the phone's (countdown.ts). */
  offsetMs: number;
  /** Re-reads the quiz after the deadline (the read closes the attempt): what it found. */
  onTimeUp: () => Promise<TimeUpOutcome>;
}) {
  // Read by the save's refusal handler, which outlives the render: time-up has its own message.
  const isTimeUpRef = useRef<() => boolean>(() => false);
  const { answers, setAnswer, flush, isGone, hasUnsentOffline, saveState, isComplete, savePending } = useQuizAnswers(
    detail,
    id,
    (err) => {
      if (apiErrorCode(err) === "attempt_closed" && !isTimeUpRef.current()) reportOutcome("error", ENDED);
    },
  );
  const submit = useSubmitAttempt(id);
  const online = useIsOnline();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Mounted only while the attempt is showing; a finished season's attempt can't be taken.
  const lock = useQuizLock({
    quizId: id,
    attemptId: detail.attemptId,
    active: !detail.readOnly,
    offsetMs,
    // The exit warning shows on return; a Submit dialog left open would sit over it.
    onLeave: () => setConfirmOpen(false),
  });
  // Time ran out: nothing more can change, and the server submits what is saved.
  const time = useTimeUp({ flush, hasUnsentOffline, readAfterDeadline: onTimeUp });
  isTimeUpRef.current = time.isTimeUp;
  // A save got through, so the network is up: send any exit still waiting with it.
  const { flushExits } = lock;
  useEffect(() => {
    if (saveState === "saved") flushExits();
    // Only on each save; flushExits is new every render.
  }, [saveState]);
  const { timeUp } = time;

  // One hand-in at a time. `submit.isPending` is only true once `mutate` has run, after the
  // flush; a double tap on Confirm reaches here twice before that. A second `mutate`
  // would also take over the first's callbacks and show its 409 as "Couldn't submit".
  const submitting = useRef(false);

  const onSubmit = async () => {
    if (submitting.current || timeUp) return;
    // The server checks completeness too (409 attempt_incomplete); the disabled
    // button is the courtesy, this is the rule.
    if (!isComplete) return;
    submitting.current = true;
    if (hasUnsentOffline()) {
      submitting.current = false;
      reportOutcome("error", SUBMIT_FAILED);
      return;
    }
    if (!(await flush())) {
      submitting.current = false;
      // Gone: the save's refusal already said so, and the screen is moving to where the attempt is.
      if (isGone()) return;
      reportOutcome("error", "Couldn't save your answers, so the quiz wasn't submitted.");
      return;
    }
    submit.mutate(undefined, {
      // The screen swaps to the result as the cache updates, so the toast (global) is
      // what confirms it while the bar is still in view.
      onSuccess: () => reportOutcome("success", "Quiz submitted."),
      onError: (err) =>
        reportOutcome("error", apiErrorCode(err) === "attempt_closed" ? ENDED : apiErrorMessage(err, SUBMIT_FAILED)),
      onSettled: () => {
        submitting.current = false;
      },
    });
  };

  // At zero: re-read (useTimeUp); the read closes the attempt on the server and the runner swaps to
  // the result. No submit call: the server submits what is saved, complete or not.
  const onExpire = () => {
    setConfirmOpen(false);
    time.expire();
  };

  // Feedback lives in the pinned bar's hint, where it stays in view: how many
  // are answered, and the autosave state.
  const answered = detail.questions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && isAnswered(q, a);
  }).length;
  const saveLabel = saveLabelFor(saveState, online);
  const progress = `${answered} of ${detail.questions.length} answered`;
  const hint = time.unconfirmed ? UNCONFIRMED : timeUp ? CLOSING : [progress, saveLabel].filter(Boolean).join(" · ");

  return (
    <Screen
      {...quizTitleProps(detail)}
      // The student is held on an open attempt (spec "Relaunch"): no way back but handing it in.
      back={null}
      pinned={
        detail.deadlineAt ? (
          <QuizCountdown deadlineAt={detail.deadlineAt} offsetMs={offsetMs} onExpire={onExpire} />
        ) : undefined
      }
      footer={
        <SaveBar
          label="Submit quiz"
          hint={hint}
          disabled={timeUp || !isComplete || savePending || submit.isPending}
          disabledReason={timeUp ? "Time's up." : isComplete ? undefined : progress}
          loading={submit.isPending}
          onPress={() => setConfirmOpen(true)}
          secondary={
            time.unconfirmed
              ? { label: "Check again", onPress: time.checkAgain }
              : saveState === "error" && !timeUp
                ? { label: "Retry save", onPress: () => void flush() }
                : undefined
          }
        />
      }
    >
      <View className="flex-col gap-3">
        {detail.questions.map((q, index) => (
          <AttemptQuestion
            key={q.id}
            q={q}
            index={index}
            answer={answers[q.id]}
            onChange={(next) => setAnswer(q, next)}
            disabled={timeUp || submit.isPending}
          />
        ))}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Submit quiz?"
          description="You can't change your answers after submitting."
          confirmLabel="Submit"
          pending={submit.isPending}
          onConfirm={() => {
            setConfirmOpen(false);
            void onSubmit();
          }}
        />
        <ExitWarning open={lock.warningOpen} onClose={lock.closeWarning} />
      </View>
    </Screen>
  );
}
