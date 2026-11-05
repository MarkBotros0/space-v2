import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button, EmptyState, GroupedList, ListRow, StatusChip, statusChip } from "../../design/ui";
import { useSubmissionQueue } from "../../hooks/use-submission-queue";
import { joinMeta } from "../../lib/join-meta";

function Row({ item, index }: { item: SubmissionQueueItem; index: number }) {
  const router = useRouter();
  const chip = statusChip("submission", item.status);
  return (
    <ListRow
      index={index}
      title={item.studentName ?? "Unnamed"}
      subtitle={joinMeta([item.assignmentTitle, item.groupName])}
      trailing={
        <View className="flex-row flex-wrap justify-end gap-1.5">
          <StatusChip {...chip} />
          {item.isLate ? <StatusChip tone="warn" label="Late" /> : null}
        </View>
      }
      chevron
      onPress={() => router.push({ pathname: "/submission/[publicId]", params: { publicId: item.publicId } })}
    />
  );
}

/**
 * ADMIN / SUPER / MENTOR on /submissions: submissions waiting for review. The
 * header count is the queue's own `counts.pending` (the number Today shows);
 * `seasonId`, when valid, is the season that count was taken in.
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
      <EmptyState icon={NAV_ICONS.submissions} title="All caught up" description="No submissions waiting for review." />
    );
  else
    body = (
      <View className="flex-col gap-4">
        <GroupedList>
          {items.map((item, i) => (
            <Row key={item.publicId} item={item} index={i} />
          ))}
        </GroupedList>
        {q.hasNextPage ? (
          <Button variant="secondary" disabled={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()}>
            Load more
          </Button>
        ) : null}
      </View>
    );

  return (
    <Screen
      title="Submissions"
      subtitle={counts ? `${counts.pending} waiting for review` : undefined}
      refreshing={q.isRefetching}
      onRefresh={refetch}
    >
      {body}
    </Screen>
  );
}
