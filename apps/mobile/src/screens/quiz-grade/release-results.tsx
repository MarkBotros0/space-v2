/**
 * Whether the quiz's students can review the answers yet (owner, 2026-11-10,
 * docs/rules/quiz-results.md). A score shows once graded; the questions, the
 * student's answers marked and the right answers stay hidden until the season's
 * admin or a super releases them, so a student taking the quiz later can't learn
 * the answers from one who took it first. Shown above the grading list and on the
 * quiz page; a leader sees the state but has no button. A paper quiz has no
 * answers to hold, so it has no card.
 */
import { useState } from "react";
import { View } from "react-native";
import type { QuizAuthoringDetail } from "@space/shared";

import { haptic } from "../../design/motion";
import { Button, ConfirmDialog, StatusChip, Text, toast } from "../../design/ui";
import { useReleaseQuizResults } from "../../hooks/use-quiz-authoring";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDate, unbreakable } from "../../lib/format";

type Props = Pick<QuizAuthoringDetail, "id" | "kind" | "publishedAt" | "answersReleasedAt" | "canReleaseResults">;

export function ReleaseResultsCard({ quiz }: { quiz: Props }) {
  const release = useReleaseQuizResults(quiz.id);
  const [confirming, setConfirming] = useState(false);
  // A paper quiz has no answers to hold, and a draft has nobody's.
  if (quiz.kind !== "ONLINE" || quiz.publishedAt === null) return null;
  const released = quiz.answersReleasedAt !== null;

  return (
    <View testID="release-results" className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="headline" className="min-w-0 flex-1">
          Answers
        </Text>
        <StatusChip className="shrink-0" tone={released ? "ok" : "warn"} label={released ? "Released" : "Held"} />
      </View>
      <Text variant="subhead" className="text-muted-foreground">
        {released
          ? `Students can review every question and the right answers. Released ${unbreakable(formatDate(quiz.answersReleasedAt!))}.`
          : quiz.canReleaseResults
            ? "Students see their score once marked, but not the questions or the right answers until you release them. Wait until everyone has taken it."
            : "Students see their score once marked. The season's admin releases the questions and the right answers."}
      </Text>
      {!released && quiz.canReleaseResults ? (
        <Button className="self-start" onPress={() => setConfirming(true)}>
          Release answers
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Release answers?"
        description="Students will see every question with the right answers. This can't be undone."
        confirmLabel="Release answers"
        pending={release.isPending}
        onConfirm={() =>
          release.mutate(undefined, {
            onSuccess: () => {
              haptic("success");
              setConfirming(false);
            },
            onError: (err) => {
              setConfirming(false);
              toast.error(apiErrorMessage(err, "Couldn't release the answers."));
            },
          })
        }
      />
    </View>
  );
}
