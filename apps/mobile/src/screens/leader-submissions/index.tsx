import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip, statusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { usePrefetchSubmission } from "../../hooks/use-submission";
import { useSubmissionQueue } from "../../hooks/use-submission-queue";
import { formatShortDateTime, unbreakable } from "../../lib/format";
import { seasonParam } from "../../lib/season-param";
import { queueSections } from "./queue-sections";

// v1 lists every SUBMITTED, REVIEWED and RETURNED row, in that order (B3-8).
const ALL = { pendingOnly: false } as const;

function subtitleOf(item: SubmissionQueueItem): string {
  return [
    item.assignmentTitle,
    item.groupName,
    item.isLate ? "Late" : null,
    item.submittedAt ? unbreakable(formatShortDateTime(item.submittedAt)) : null,
  ]
    .filter((part): part is string => !!part)
    .join(" · ");
}

/** LEADER — v1 app/leader/submissions/page.tsx, the review queue. */
export function LeaderQueue() {
  const router = useRouter();
  const prefetch = usePrefetchSubmission();
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
  const open = (publicId: string) => router.push({ pathname: "/submission/[publicId]", params: { publicId } });
  const row = (item: SubmissionQueueItem) => (
    <ListRow
      key={item.publicId}
      title={item.studentName ?? "Student"}
      titleLines={2}
      subtitle={subtitleOf(item)}
      subtitleLines={3}
      trailing={<StatusChip {...statusChip("submission", item.status)} />}
      chevron
      onPress={() => open(item.publicId)}
      onPressIn={() => prefetch(item.publicId)}
    />
  );

  return (
    <Screen
      title="Submissions"
      subtitle={
        counts
          ? `${counts.pending} pending review · ${counts.total} total${counts.late > 0 ? ` · ${counts.late} late` : ""}`
          : undefined
      }
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <View className="flex-col gap-4">
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
              title="No submissions yet"
              description="Submissions from students in your groups will appear here."
            />
          ) : (
            <>
              {waiting.length > 0 ? <GroupedList header="Waiting for review">{waiting.map(row)}</GroupedList> : null}
              {done.length > 0 ? <GroupedList header="Reviewed">{done.map(row)}</GroupedList> : null}
            </>
          )}
          {/* Paging is v2's (spec 08 D12); v1 loaded every row. */}
          {hasNextPage ? (
            <Button
              variant="secondary"
              className="self-center"
              disabled={isFetchingNextPage}
              onPress={() => void fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
