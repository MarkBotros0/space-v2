import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList } from "../../design/ui";
import { LoadMoreButton } from "../../design/ui/load-more-button";
import { useSubmissionQueue } from "../../hooks/use-submission-queue";
import { EssayQueueRow, pendingLine, QueueTotals } from "./essay-queue-row";

/**
 * ADMIN / SUPER / MENTOR on /submissions: essays waiting for review, one row
 * per student per essay. The header count is the queue's own `counts.pending`
 * (the number Today shows); `seasonId`, when valid, is the season it was taken in.
 */
export function StaffPendingQueue({ seasonId }: { seasonId: number | undefined }) {
  const q = useSubmissionQueue(seasonId === undefined ? { pendingOnly: true } : { pendingOnly: true, seasonId }, true);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  // Counts ignore paging and pendingOnly; only the first page carries them.
  const counts = q.data?.pages[0]?.counts;
  const refetch = () => void q.refetch();

  let body;
  if (q.isPending) body = <RouteSkeleton />;
  else if (q.isError) body = <RouteError onRetry={refetch} />;
  else if (items.length === 0)
    body = (
      <EmptyState icon={NAV_ICONS.submissions} title="All caught up" description="No essays waiting for review." />
    );
  else
    body = (
      <View className="flex-col gap-4">
        {counts && counts.total > 0 ? <QueueTotals counts={counts} /> : null}
        <GroupedList>
          {items.map((item) => (
            <EssayQueueRow key={item.publicId} item={item} />
          ))}
        </GroupedList>
        <LoadMoreButton query={q} />
      </View>
    );

  return (
    <Screen
      title="Submissions"
      subtitle={counts ? pendingLine(counts) : undefined}
      refreshing={q.isRefetching}
      onRefresh={refetch}
    >
      {body}
    </Screen>
  );
}
