import type { QuizGradingAttempt } from "@space/shared";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AttemptSummary } from "./attempt-summary";
import { ExitLog } from "./exit-log";
import { manualScoreTarget } from "./manual-score-model";
import { useManualScoreSheet } from "./manual-score-sheet";
import { initialMarks, markedCount, marksComplete, setMark, setPoints, toMarkInput } from "./marking-model";
import { QuizAttemptAnswers } from "./quiz-answer-marker";
import { haptic } from "../../design/motion";
import { Button } from "../../design/ui/button";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";
import { useMarkAttempt, useReopenAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";

/**
 * One online attempt in a bottom sheet (owner, 2026-11-13 redesign): at the top where it stands,
 * its score and its actions (Allow a retake, the admin's Enter score manually); then the exit log; then each
 * question as its own section with the key (shown to the grader, R103), Right / Wrong per blank and
 * points per essay. Keyed by attempt by the caller, so the
 * marks survive a dismiss and reopen of the same attempt. Save waits until every item is
 * marked: the server refuses a partial set (marks_incomplete). The season's admin (`canScore`) can
 * enter or edit the student's own score (plan 4), shown in place of the answers: one modal at a
 * time, since opening a second as the first closes drops it on iOS. A student with the admin's
 * score has no retake: the server refuses one until the score is cleared.
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
  const canMark = marks.length > 0;
  const complete = marksComplete(marks);

  const save = () => {
    if (!complete) return;
    setError(null);
    markAttempt.mutate(
      { attemptId: attempt.attemptId, ...toMarkInput(marks) },
      {
        onSuccess: () => {
          haptic("success");
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
        haptic("success");
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
        <AttemptSummary
          attempt={attempt}
          maxScore={maxScore}
          canScore={canScore}
          onScore={() => setScoring(true)}
          onRetake={onReopen}
          retaking={reopen.isPending}
        />
        <ExitLog attempt={attempt} />
        <QuizAttemptAnswers
          attempt={attempt}
          marks={marks}
          onMark={(questionId, blankId, correct) => setMarks((prev) => setMark(prev, questionId, blankId, correct))}
          onPoints={(questionId, points) => setMarks((prev) => setPoints(prev, questionId, points))}
        />
        {error && !canMark ? (
          <Text variant="subhead" className="text-bad">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
