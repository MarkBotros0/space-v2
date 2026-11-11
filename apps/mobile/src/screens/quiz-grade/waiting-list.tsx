import { useState } from "react";
import type { QuizGradingPage } from "@space/shared";

import { haptic } from "../../design/motion";
import { ConfirmDialog } from "../../design/ui";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { PillButton } from "../../design/ui/pill-button";
import { toast } from "../../design/ui/toaster";
import { useEndAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDate, unbreakable } from "../../lib/format";

type Waiting = QuizGradingPage["waiting"][number];

/**
 * V2-ONLY (spec 12 D5/R102): students who haven't finished.
 *
 * No Reopen here, and no press on the row. A waiting student either never started (the server
 * answers 409 `no_attempt`) or has an attempt still IN_PROGRESS (409 `attempt_open`), which they can
 * simply resume. An open attempt has End instead (docs/rules/quiz-integrity.md "Timing"): it submits
 * what the student has saved, after a confirm.
 */
export function WaitingList({ quizId, waiting }: { quizId: number; waiting: Waiting[] }) {
  const end = useEndAttempt(quizId);
  const [ending, setEnding] = useState<Waiting | null>(null);
  const name = (w: Waiting) => w.studentName ?? "Student";

  const confirm = () => {
    if (!ending) return;
    end.mutate(ending.studentUserId, {
      onSuccess: () => {
        haptic("light");
        toast.success("Attempt ended.");
      },
      onError: (err) => toast.error(apiErrorMessage(err, "Couldn't end the attempt.")),
      onSettled: () => setEnding(null),
    });
  };

  return (
    <>
      <GroupedList header="Waiting">
        {waiting.map((w) => (
          <ListRow
            key={w.studentUserId}
            title={name(w)}
            titleLines={2}
            subtitle={
              w.startedAt === null ? "Not started" : `In progress since ${unbreakable(formatDate(w.startedAt))}`
            }
            trailingPlacement="below"
            trailing={
              w.startedAt === null ? undefined : (
                <PillButton
                  label="End attempt"
                  accessibilityLabel={`End ${name(w)}'s attempt`}
                  destructive
                  disabled={end.isPending}
                  onPress={() => setEnding(w)}
                />
              )
            }
          />
        ))}
      </GroupedList>
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => {
          if (!open && !end.isPending) setEnding(null);
        }}
        title={ending ? `End ${name(ending)}'s attempt?` : "End attempt?"}
        description="Their saved answers are submitted."
        confirmLabel="End attempt"
        destructive
        pending={end.isPending}
        onConfirm={confirm}
      />
    </>
  );
}
