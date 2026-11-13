import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { QuizAuthoringDetail } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState } from "../../design/ui";
import { Text } from "../../design/ui/text";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip, statusChip } from "../../design/ui/status-chip";
import { flattenGradingPages, useQuizAttempts } from "../../hooks/use-quizzes";
import { AttemptSheet } from "./attempt-sheet";
import { adminScoreLabel, attemptSubtitle } from "./attempt-subtitle";
import { ReleaseResultsCard } from "./release-results";
import { WaitingList } from "./waiting-list";
import { LoadMoreButton } from "../../design/ui/load-more-button";

export function OnlineGrading({ id, detail }: { id: number; detail: QuizAuthoringDetail }) {
  const attempts = useQuizAttempts(id, true);
  const [shown, setShown] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const first = attempts.data?.pages[0];
  let body: ReactNode;
  let sheet: ReactNode = null;
  if (attempts.isPending) body = <RouteSkeleton />;
  else if (attempts.isError || !first) body = <RouteError onRetry={() => void attempts.refetch()} />;
  else {
    // The server pages over students, 20 at a time; both lists grow per page.
    const { items, waiting } = flattenGradingPages(attempts.data.pages);
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = attempts;
    const attempt = items.find((a) => a.attemptId === shown);
    if (attempt)
      sheet = (
        <AttemptSheet
          key={attempt.attemptId}
          quizId={id}
          attempt={attempt}
          maxScore={first.maxScore}
          canScore={detail.canReleaseResults}
          open={open}
          onClose={() => setOpen(false)}
        />
      );
    body = (
      <View className="flex-col gap-4">
        <ReleaseResultsCard quiz={detail} />
        {/* "Submitted" with how to mark, always in view (owner, 2026-11-13: the screen didn't show
            that marking was there, only Enter score). Students come in name order from the server. */}
        {items.length === 0 ? (
          hasNextPage ? null : (
            <EmptyState
              title="Nobody has submitted yet"
              description="When students submit, they show here. Tap one to mark their answers."
            />
          )
        ) : (
          <View className="flex-col gap-1.5">
            <GroupedList header="Submitted">
              {items.map((a) => (
                <ListRow
                  key={a.attemptId}
                  title={a.studentName ?? "Student"}
                  titleLines={2}
                  {...(a.adminScore ? { detail: adminScoreLabel(a.adminScore.score, first.maxScore) } : {})}
                  subtitle={attemptSubtitle(a, first.maxScore)}
                  trailing={<StatusChip {...statusChip("quizAttempt", a.status)} />}
                  chevron
                  onPress={() => {
                    setShown(a.attemptId);
                    setOpen(true);
                  }}
                />
              ))}
            </GroupedList>
            <Text variant="caption" className="px-4 text-muted-foreground">
              Tap a student to mark their answers.
            </Text>
          </View>
        )}
        {waiting.length > 0 ? (
          <WaitingList quizId={id} waiting={waiting} maxScore={first.maxScore} canScore={detail.canReleaseResults} />
        ) : null}
        <LoadMoreButton
          query={{ hasNextPage, isFetchingNextPage, fetchNextPage }}
          loadingLabel="Loading…"
          className="self-center"
        />
      </View>
    );
  }

  return (
    <Screen
      title={detail.title}
      subtitle={`Max score: ${detail.maxScore}`}
      refreshing={attempts.isRefetching && !attempts.isFetchingNextPage}
      onRefresh={() => void attempts.refetch()}
    >
      {body}
      {sheet}
    </Screen>
  );
}
