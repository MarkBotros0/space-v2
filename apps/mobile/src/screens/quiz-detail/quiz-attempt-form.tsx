import { useRef, useState } from "react";
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
import { QuestionInput, questionTypeLabel } from "./questions";
import { QuizCountdown } from "./quiz-countdown";
import { QCARD, quizTitleProps } from "./quiz-header";
import { useQuizAnswers } from "./use-quiz-answers";

const SUBMIT_FAILED = "Couldn't submit the quiz. Check your connection and try again.";
const TIME_UP = "Time's up. Your answers were submitted.";
/** Staff ended it, or the server's clock ran out first; the screen moves to the result. */
const ENDED = "This attempt has ended.";

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
  /** Re-reads the quiz after the deadline (the read closes the attempt); true once it is closed. */
  onTimeUp: () => Promise<boolean>;
}) {
  // Read by the save's refusal handler, which outlives the render: time-up has its own message.
  const timeUpRef = useRef(false);
  const { answers, setAnswer, flush, isGone, hasUnsentOffline, saveState, isComplete, savePending } = useQuizAnswers(
    detail,
    id,
    (err) => {
      if (apiErrorCode(err) === "attempt_closed" && !timeUpRef.current) reportOutcome("error", ENDED);
    },
  );
  const submit = useSubmitAttempt(id);
  const online = useIsOnline();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Time ran out: nothing more can change, and the server submits what is saved.
  const [timeUp, setTimeUp] = useState(false);

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

  // At zero: send what is still waiting, then re-read; the read closes the attempt on the server and
  // the runner swaps to the result. No submit call: the server submits what is saved, complete or not.
  const onExpire = async () => {
    timeUpRef.current = true;
    setTimeUp(true);
    setConfirmOpen(false);
    // Offline, a flush would wait for the connection; the server already holds the last saves.
    if (!hasUnsentOffline()) await flush();
    if (await onTimeUp()) reportOutcome("success", TIME_UP);
  };

  // Feedback lives in the pinned bar's hint, where it stays in view: how many
  // are answered, and the autosave state.
  const answered = detail.questions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && isAnswered(q, a);
  }).length;
  const saveLabel =
    saveState === "saving"
      ? online
        ? "Saving…"
        : "Waiting for connection"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Not saved"
          : null;
  const progress = `${answered} of ${detail.questions.length} answered`;
  const hint = timeUp ? "Time's up. Submitting your answers…" : [progress, saveLabel].filter(Boolean).join(" · ");

  return (
    <Screen
      {...quizTitleProps(detail)}
      pinned={
        detail.deadlineAt ? (
          <QuizCountdown deadlineAt={detail.deadlineAt} offsetMs={offsetMs} onExpire={() => void onExpire()} />
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
            saveState === "error" && !timeUp ? { label: "Retry save", onPress: () => void flush() } : undefined
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
      </View>
    </Screen>
  );
}
