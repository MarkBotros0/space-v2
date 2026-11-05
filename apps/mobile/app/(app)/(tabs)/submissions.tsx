import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { NAV_ICONS } from "../../../src/design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import {
  Button,
  Card,
  EmptyState,
  Text,
} from "../../../src/design/ui";
import { useSubmissionQueue } from "../../../src/hooks/use-submission-queue";
import { LeaderQueue } from "../../../src/screens/leader-submissions";
import { useSessionStore } from "../../../src/store/session";

const PENDING = { pendingOnly: true } as const;

function QueueRow({ item }: { item: SubmissionQueueItem }) {
  const router = useRouter();

  return (
    <Card
      className="p-4"
      onPress={() =>
        router.push({ pathname: "/submission/[publicId]", params: { publicId: item.publicId } })
      }
    >
      <Text className="text-lg font-semibold">{item.assignmentTitle}</Text>
      <Text className="text-sm font-medium text-muted-foreground">
        {`${item.studentName ?? "Unnamed"} · ${item.groupName ?? "No group"}${item.isLate ? " · Late" : ""}`}
      </Text>
    </Card>
  );
}

/**
 * ADMIN / SUPER / MENTOR — the pre-batch pending queue, unchanged until their
 * batches (plan: other roles keep their rendering). v1 had no admin queue.
 */
function PendingQueue() {
  const {
    data,
    isPending,
    isError,
    refetch,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSubmissionQueue(PENDING, true);

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  // Counts ignore paging and pendingOnly; only the first page carries them.
  const counts = data?.pages[0]?.counts;

  return (
    <ShellFrame onRefresh={() => void refetch()} refreshing={isRefetching}>
      <View className="flex-col gap-2">
        {counts ? (
          <Text className="text-sm font-medium text-muted-foreground">
            {`${counts.pending} pending review · ${counts.total} total${counts.late > 0 ? ` · ${counts.late} late` : ""}`}
          </Text>
        ) : null}
        {isPending ? (
          <RouteSkeleton />
        ) : isError ? (
          <RouteError onRetry={() => void refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={NAV_ICONS.submissions}
            title="All caught up"
            description="No submissions waiting for review."
          />
        ) : (
          <>
            {items.map((item) => (
              <QueueRow key={item.publicId} item={item} />
            ))}
            {hasNextPage ? (
              <Button
                variant="secondary"
                size="lg"
                disabled={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
              >
                Load more
              </Button>
            ) : null}
          </>
        )}
      </View>
    </ShellFrame>
  );
}

/** The Submissions tab: the leader's review queue, a pending list for other staff. */
export default function SubmissionsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";

  if (role === "LEADER") return <LeaderQueue />;
  if (isStaff) return <PendingQueue />;
  return (
    <ShellFrame>
      <EmptyState
        icon={NAV_ICONS.submissions}
        title="Submissions"
        description="This screen isn't available for your role."
      />
    </ShellFrame>
  );
}
