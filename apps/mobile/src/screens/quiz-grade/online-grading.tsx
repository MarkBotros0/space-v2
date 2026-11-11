import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { QuizAuthoringDetail } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState } from "../../design/ui";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip, statusChip } from "../../design/ui/status-chip";
import { flattenGradingPages, useQuizAttempts } from "../../hooks/use-quizzes";
import { formatDate, unbreakable } from "../../lib/format";
import { AttemptSheet } from "./attempt-sheet";
import { ReleaseResultsCard } from "./release-results";
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
          open={open}
          onClose={() => setOpen(false)}
        />
      );
    body = (
      <View className="flex-col gap-4">
        <ReleaseResultsCard quiz={detail} />
        {items.length === 0 ? (
          hasNextPage ? null : (
            <EmptyState
              title="No submissions yet"
              description="Student attempts will appear here once they submit this quiz."
            />
          )
        ) : (
          <GroupedList>
            {items.map((a) => (
              <ListRow
                key={a.attemptId}
                title={a.studentName ?? "Student"}
                titleLines={2}
                subtitle={`Attempt ${a.attemptNumber} · ${a.status === "GRADED" ? `${a.totalScore ?? 0}/${first.maxScore}` : "Awaiting grading"} · ${unbreakable(formatDate(a.submittedAt))}`}
                trailing={<StatusChip {...statusChip("quizAttempt", a.status)} />}
                chevron
                onPress={() => {
                  setShown(a.attemptId);
                  setOpen(true);
                }}
              />
            ))}
          </GroupedList>
        )}
        {waiting.length > 0 ? (
          /**
           * V2-ONLY (spec 12 D5/R102): students who haven't finished.
           *
           * No Reopen here, and no press at all. A waiting student either never
           * started (the server answers 409 `no_attempt`) or has an attempt still
           * IN_PROGRESS (409 `attempt_open`) — they can simply resume it — so the
           * button could only ever fail.
           */
          <GroupedList header="Waiting">
            {waiting.map((w) => (
              <ListRow
                key={w.studentUserId}
                title={w.studentName ?? "Student"}
                titleLines={2}
                subtitle={
                  w.startedAt === null ? "Not started" : `In progress since ${unbreakable(formatDate(w.startedAt))}`
                }
              />
            ))}
          </GroupedList>
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
