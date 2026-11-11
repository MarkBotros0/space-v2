import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList } from "../../design/ui/grouped-list";
import { LoadMoreButton } from "../../design/ui/load-more-button";
import { Text } from "../../design/ui/text";
import { useSubmissionQueue } from "../../hooks/use-submission-queue";
import { seasonParam } from "../../lib/season-param";
import { EssayQueueRow, pendingLine, QueueTotals } from "../staff-queue/essay-queue-row";
import { queueSections } from "./queue-sections";

// v1 lists every essay handed in: waiting first, then reviewed and returned (B3-8).
const ALL = { pendingOnly: false } as const;

/** LEADER: the review queue (v1 app/leader/submissions/page.tsx), one row per student per essay. */
export function LeaderQueue() {
  const router = useRouter();
  // Set when opened from the dashboard's Assignments card, whose figures are
  // one season's: the queue narrows to match. From the tab bar it is absent
  // and the queue is v1's cross-season list.
  const seasonId = seasonParam(useLocalSearchParams<{ seasonId?: string }>().seasonId);
  const { data, isPending, isError, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSubmissionQueue(seasonId === undefined ? ALL : { ...ALL, seasonId }, true);

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  // Counts ignore paging and pendingOnly; only the first page carries them.
  const counts = data?.pages[0]?.counts;
  const { waiting, done } = queueSections(items);

  return (
    <Screen
      title="Submissions"
      subtitle={counts ? pendingLine(counts) : undefined}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <View className="flex-col gap-4">
          {counts && counts.total > 0 ? <QueueTotals counts={counts} /> : null}
          {seasonId !== undefined ? (
            // The tab keeps its params, so a season filter set from the
            // dashboard must be visible and removable, not a silent state.
            <View className="flex-row flex-wrap items-center gap-2">
              <Text variant="subhead" className="text-muted-foreground">
                Current season only
              </Text>
              <Button
                variant="plain"
                size="sm"
                className="self-start"
                onPress={() => router.setParams({ seasonId: undefined })}
              >
                Show all seasons
              </Button>
            </View>
          ) : null}
          {items.length === 0 ? (
            <EmptyState
              icon={NAV_ICONS.submissions}
              title="No essays yet"
              description="Essays from students in your groups appear here once they submit."
            />
          ) : (
            <>
              {waiting.length > 0 ? (
                <GroupedList header="Waiting for review">
                  {waiting.map((item) => (
                    <EssayQueueRow key={item.publicId} item={item} />
                  ))}
                </GroupedList>
              ) : null}
              {done.length > 0 ? (
                <GroupedList header="Reviewed">
                  {done.map((item) => (
                    <EssayQueueRow key={item.publicId} item={item} />
                  ))}
                </GroupedList>
              ) : null}
            </>
          )}
          {/* Paging is v2's (spec 08 D12); v1 loaded every row. */}
          <LoadMoreButton query={{ hasNextPage, isFetchingNextPage, fetchNextPage }} className="self-center" />
        </View>
      )}
    </Screen>
  );
}
