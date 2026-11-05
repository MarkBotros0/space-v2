import type { QuizGradingAttempt } from "@space/shared";
import { useEffect, useState } from "react";
import { View } from "react-native";

import {
  initialAwards,
  parseAwards,
  QuizAttemptAnswers,
  ReopenButton,
} from "../../design/quizzes/quiz-essay-grader";
import { haptic } from "../../design/motion";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";
import { toast } from "../../design/ui/toaster";
import { useGradeEssays, useReopenAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";

/**
 * One online attempt in a bottom sheet: the answers (the key is shown to the
 * grader, R103), an award per essay, and Reopen retake. Keyed by attempt by the
 * caller, so the typed awards survive a dismiss and reopen of the same attempt.
 */
export function AttemptSheet({
  quizId,
  attempt,
  maxScore,
  hasEssays,
  open,
  onClose,
}: {
  quizId: number;
  attempt: QuizGradingAttempt;
  maxScore: number;
  hasEssays: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const gradeEssays = useGradeEssays(quizId);
  const reopen = useReopenAttempt(quizId);
  const [awards, setAwards] = useState(() => initialAwards(attempt));
  // The server's awarded points, as a value: a refetch makes new objects, so
  // identity says nothing. Unchanged keeps the draft across dismiss and reopen;
  // changed (a save here, or a co-grader's) re-seeds so a later save cannot
  // overwrite their mark with a stale typed one.
  const seed = JSON.stringify(Object.entries(initialAwards(attempt)));
  const [seeded, setSeeded] = useState(seed);
  if (seed !== seeded) {
    setSeeded(seed);
    setAwards(initialAwards(attempt));
  }
  const [error, setError] = useState<string | null>(null);
  // A failure belongs to the visit that caused it: a reopened sheet starts clean.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  const hasEssayAnswers = hasEssays && attempt.answers.some((a) => a.type === "ESSAY");
  const graded = attempt.status === "GRADED";

  const save = () => {
    setError(null);
    const parsed = parseAwards(attempt, awards);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    gradeEssays.mutate(
      { attemptId: attempt.attemptId, awards: parsed.awards },
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={attempt.studentName ?? "Student"}
      footer={hasEssayAnswers ? <SheetSaveBar label="Save marks" onPress={save} loading={gradeEssays.isPending} /> : undefined}
    >
      <View className="flex-col gap-4 pb-4">
        <Text variant="caption" className="text-muted-foreground">
          {`Attempt ${attempt.attemptNumber} · ${graded ? `Graded · ${attempt.totalScore ?? 0}/${maxScore}` : "Awaiting grading"}`}
        </Text>
        <QuizAttemptAnswers
          attempt={attempt}
          awards={awards}
          onAward={(questionId, value) => setAwards((prev) => ({ ...prev, [questionId]: value }))}
        />
        {error ? <Text variant="subhead" className="text-bad">{error}</Text> : null}
        {attempt.status !== "IN_PROGRESS" ? (
          <ReopenButton onPress={onReopen} disabled={reopen.isPending} />
        ) : null}
      </View>
    </Sheet>
  );
}
