import type { QuizGradingAttempt } from "@space/shared";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { ExitLog } from "./exit-log";
import { manualScoreTarget } from "./manual-score-model";
import { useManualScoreSheet } from "./manual-score-sheet";
import { hasLegacyMarks, initialMarks, markedCount, marksComplete, setMark, toMarkInput } from "./marking-model";
import { QuizAttemptAnswers, ReopenButton } from "./quiz-answer-marker";
import { haptic } from "../../design/motion";
import { Button } from "../../design/ui/button";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";
import { toast } from "../../design/ui/toaster";
import { useMarkAttempt, useReopenAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { formatScore } from "../../lib/format";

/**
 * One online attempt in a bottom sheet: the answers with the key (shown to the grader, R103),
 * Right / Wrong per blank and essay, and Reopen retake. Keyed by attempt by the caller, so the
 * marks survive a dismiss and reopen of the same attempt. Save waits until every item is
 * marked: the server refuses a partial set (marks_incomplete). The season's admin (`canScore`) can
 * enter or edit the student's own score (plan 4), shown in place of the answers: one modal at a
 * time, since opening a second as the first closes drops it on iOS. A student with the admin's
 * score has no Reopen retake: the server refuses one until the score is cleared.
 */
export function AttemptSheet({
  quizId,
  attempt,
  maxScore,
  canScore,
  open,
  onClose,
}: {
  quizId: number;
  attempt: QuizGradingAttempt;
  maxScore: number;
  canScore: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [scoring, setScoring] = useState(false);
  const score = useManualScoreSheet({
    quizId,
    target: manualScoreTarget(attempt, maxScore),
    maxScore,
    open: open && scoring,
    onDone: onClose,
  });
  const markAttempt = useMarkAttempt(quizId);
  const reopen = useReopenAttempt(quizId);
  const [marks, setMarks] = useState(() => initialMarks(attempt));
  // The server's marks, as a value: a refetch makes new objects, so identity says nothing.
  // Unchanged keeps the draft across dismiss and reopen; changed (a save here, or a co-grader's)
  // re-seeds so a later save cannot overwrite their mark with a stale one.
  const seed = JSON.stringify(initialMarks(attempt));
  const [seeded, setSeeded] = useState(seed);
  if (seed !== seeded) {
    setSeeded(seed);
    setMarks(initialMarks(attempt));
  }
  const [error, setError] = useState<string | null>(null);
  // A failure belongs to the visit that caused it: a reopened sheet starts clean.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setScoring(false);
  }, [open]);
  // An essay marked with points before right/wrong existed would lose them to a re-mark.
  const readOnly = hasLegacyMarks(attempt);
  const canMark = marks.length > 0 && !readOnly;
  const complete = marksComplete(marks);
  const graded = attempt.status === "GRADED";

  const save = () => {
    if (!complete) return;
    setError(null);
    markAttempt.mutate(
      { attemptId: attempt.attemptId, ...toMarkInput(marks) },
      {
        onSuccess: () => {
          haptic("light");
          toast.success("Marks saved.");
          onClose();
        },
        onError: (err) => setError(apiErrorMessage(err, "Couldn't save the marks.")),
      },
    );
  };

  const onReopen = () => {
    setError(null);
    reopen.mutate(attempt.studentUserId, {
      onSuccess: () => {
        haptic("light");
        toast.success("Retake reopened.");
        onClose();
      },
      onError: (err) => setError(apiErrorMessage(err, "Couldn't reopen the attempt.")),
    });
  };

  if (scoring) {
    return (
      <Sheet open={open} onClose={onClose} title={score.title} footer={score.footer}>
        <Button variant="plain" size="sm" className="self-start" onPress={() => setScoring(false)}>
          Back to the answers
        </Button>
        {score.body}
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={attempt.studentName ?? "Student"}
      footer={
        canMark ? (
          <SheetSaveBar
            label="Save marks"
            onPress={save}
            loading={markAttempt.isPending}
            disabled={!complete}
            disabledReason="Mark every blank and essay first."
            hint={`${markedCount(marks)} of ${marks.length} marked`}
            error={error}
          />
        ) : undefined
      }
    >
      <View className="flex-col gap-4 pb-4">
        <Text variant="caption" className="text-muted-foreground">
          {`Attempt ${attempt.attemptNumber} · ${graded ? `Graded · ${formatScore(attempt.totalScore ?? 0)}/${maxScore}` : "Awaiting grading"}`}
        </Text>
        <AdminScoreLine attempt={attempt} maxScore={maxScore} canScore={canScore} onScore={() => setScoring(true)} />
        <ExitLog attempt={attempt} />
        <QuizAttemptAnswers
          attempt={attempt}
          marks={marks}
          readOnly={readOnly}
          onMark={(questionId, blankId, correct) => setMarks((prev) => setMark(prev, questionId, blankId, correct))}
        />
        {error && !canMark ? (
          <Text variant="subhead" className="text-bad">
            {error}
          </Text>
        ) : null}
        {attempt.status !== "IN_PROGRESS" && attempt.adminScore === null ? (
          <ReopenButton onPress={onReopen} disabled={reopen.isPending} />
        ) : null}
      </View>
    </Sheet>
  );
}

/** The admin's score, when there is one, and for the season's admin the way to enter or edit it. */
function AdminScoreLine({
  attempt,
  maxScore,
  canScore,
  onScore,
}: {
  attempt: QuizGradingAttempt;
  maxScore: number;
  canScore: boolean;
  onScore: () => void;
}) {
  const admin = attempt.adminScore;
  return (
    <>
      {admin ? (
        <Text variant="subhead">{`Score entered by admin: ${formatScore(admin.score)} / ${formatScore(maxScore)}`}</Text>
      ) : null}
      {canScore ? (
        <Button variant="secondary" size="sm" className="self-start" onPress={onScore}>
          {admin ? "Edit score" : "Enter score"}
        </Button>
      ) : null}
    </>
  );
}
