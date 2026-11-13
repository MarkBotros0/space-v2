import { useState } from "react";
import { View } from "react-native";

import { Text } from "../../design/ui/text";
import type { QuizGradingPage } from "@space/shared";

import { haptic } from "../../design/motion";
import { ConfirmDialog } from "../../design/ui";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { PillButton } from "../../design/ui/pill-button";
import { toast } from "../../design/ui/toaster";
import { useEndAttempt } from "../../hooks/use-quizzes";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDate, formatScore, unbreakable } from "../../lib/format";
import { ManualScoreSheet } from "./manual-score-sheet";
import { manualScoreTarget } from "./manual-score-model";

type Waiting = QuizGradingPage["waiting"][number];

/**
 * V2-ONLY (spec 12 D5/R102): students who haven't finished, under "Not submitted" (owner,
 * 2026-11-13: "Waiting" didn't say what they were waiting for). "Enter score manually" says what it
 * is, and a note under the list says it is for a quiz taken outside the app: marking is on the
 * Submitted list.
 *
 * No Reopen here, and no press on the row. A waiting student either never started (the server
 * answers 409 `no_attempt`) or has an attempt still IN_PROGRESS (409 `attempt_open`), which they can
 * simply resume. An open attempt has End instead (docs/rules/quiz-integrity.md "Timing"): it submits
 * what the student has saved, after a confirm. The season's admin (`canScore`) can enter a score
 * for any of them (plan 4); an open attempt is refused until it is ended.
 */
export function WaitingList({
  quizId,
  waiting,
  maxScore,
  canScore,
}: {
  quizId: number;
  waiting: Waiting[];
  maxScore: number;
  canScore: boolean;
}) {
  const end = useEndAttempt(quizId);
  const [ending, setEnding] = useState<Waiting | null>(null);
  // By id, so the sheet reads the row as the last refetch has it.
  const [scoringId, setScoringId] = useState<number | null>(null);
  const scoring = waiting.find((w) => w.studentUserId === scoringId);
  const [scoreOpen, setScoreOpen] = useState(false);
  const name = (w: Waiting) => w.studentName ?? "Student";
  const subtitle = (w: Waiting) => {
    if (w.adminScore) return `${formatScore(w.adminScore.score)} / ${formatScore(maxScore)}`;
    return w.startedAt === null ? "Not started" : `In progress since ${unbreakable(formatDate(w.startedAt))}`;
  };

  const confirm = () => {
    if (!ending) return;
    end.mutate(ending.studentUserId, {
      onSuccess: () => {
        haptic("success");
      },
      onError: (err) => toast.error(apiErrorMessage(err, "Couldn't end the attempt.")),
      onSettled: () => setEnding(null),
    });
  };

  return (
    <>
      <View className="flex-col gap-1.5">
        <GroupedList header="Not submitted">
          {waiting.map((w) => (
            <ListRow
              key={w.studentUserId}
              title={name(w)}
              titleLines={2}
              {...(w.adminScore ? { detail: "Score entered by admin" } : {})}
              subtitle={subtitle(w)}
              trailingPlacement="below"
              trailing={
                w.startedAt === null && !canScore ? undefined : (
                  <View className="flex-row flex-wrap gap-2">
                    {w.startedAt === null ? null : (
                      <PillButton
                        label="End attempt"
                        accessibilityLabel={`End ${name(w)}'s attempt`}
                        destructive
                        disabled={end.isPending}
                        onPress={() => setEnding(w)}
                      />
                    )}
                    {canScore ? (
                      <PillButton
                        label={w.adminScore ? "Edit manual score" : "Enter score manually"}
                        accessibilityLabel={`${w.adminScore ? "Edit the manual score" : "Enter a score manually"} for ${name(w)}`}
                        onPress={() => {
                          setScoringId(w.studentUserId);
                          setScoreOpen(true);
                        }}
                      />
                    ) : null}
                  </View>
                )
              }
            />
          ))}
        </GroupedList>
        {canScore ? (
          <Text variant="caption" className="px-4 text-muted-foreground">
            Enter a score manually only for a student who took the quiz outside the app.
          </Text>
        ) : null}
      </View>
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
      {scoring ? (
        <ManualScoreSheet
          key={scoring.studentUserId}
          quizId={quizId}
          target={manualScoreTarget(scoring, maxScore)}
          maxScore={maxScore}
          open={scoreOpen}
          onClose={() => setScoreOpen(false)}
        />
      ) : null}
    </>
  );
}
