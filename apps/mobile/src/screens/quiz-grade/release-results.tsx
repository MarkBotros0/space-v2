/**
 * Whether the quiz's students can see their results yet (owner, 2026-11-07).
 * Scores and right or wrong answers stay hidden until the season's admin or a
 * super releases them, so a student taking the quiz later can't learn the
 * answers from one who took it first. Shown above the grading list and on the
 * quiz page; a leader sees the state but has no button.
 */
import { useState } from "react";
import { View } from "react-native";
import type { QuizAuthoringDetail } from "@space/shared";

import { haptic } from "../../design/motion";
import { Button, ConfirmDialog, StatusChip, Text, toast } from "../../design/ui";
import { useReleaseQuizResults } from "../../hooks/use-quiz-authoring";
import { apiErrorMessage } from "../../lib/api-error";
import { formatDate, unbreakable } from "../../lib/format";

type Props = Pick<QuizAuthoringDetail, "id" | "kind" | "publishedAt" | "resultsReleasedAt" | "canReleaseResults">;

export function ReleaseResultsCard({ quiz }: { quiz: Props }) {
  const release = useReleaseQuizResults(quiz.id);
  const [confirming, setConfirming] = useState(false);
  // A draft has nobody's results to hold.
  if (quiz.kind === "ONLINE" && quiz.publishedAt === null) return null;
  const released = quiz.resultsReleasedAt !== null;

  return (
    <View testID="release-results" className="flex-col gap-3 rounded-group bg-surface p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="headline" className="min-w-0 flex-1">
          Results
        </Text>
        <StatusChip
          className="shrink-0"
          tone={released ? "ok" : "warn"}
          label={released ? "Released" : "Held"}
        />
      </View>
      <Text variant="subhead" className="text-muted-foreground">
        {released
          ? `Students can see their scores. Released ${unbreakable(formatDate(quiz.resultsReleasedAt!))}.`
          : quiz.canReleaseResults
            ? "Students can't see their scores or which answers were right until you release them. Wait until everyone has taken it."
            : "Students can't see their scores until the season's admin releases them."}
      </Text>
      {!released && quiz.canReleaseResults ? (
        <Button className="self-start" onPress={() => setConfirming(true)}>
          Release results
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Release results?"
        description="Every student who has been graded sees their score and which answers were right, and is told. Anyone graded later sees theirs straight away. This can't be undone."
        confirmLabel="Release results"
        pending={release.isPending}
        onConfirm={() =>
          release.mutate(undefined, {
            onSuccess: () => {
              haptic("success");
              toast.success("Results released.");
              setConfirming(false);
            },
            onError: (err) => {
              setConfirming(false);
              toast.error(apiErrorMessage(err, "Couldn't release the results."));
            },
          })
        }
      />
    </View>
  );
}
