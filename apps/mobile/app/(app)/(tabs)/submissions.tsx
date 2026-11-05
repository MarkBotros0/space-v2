import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { PageTitle } from "../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../src/design/layout/route-states";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  SubmissionStatusBadge,
  Text,
  type DataTableColumn,
} from "../../../src/design/ui";
import { usePrefetchSubmission } from "../../../src/hooks/use-submission";
import { useSubmissionQueue } from "../../../src/hooks/use-submission-queue";
import { formatShortDateTime } from "../../../src/lib/format";
import { useSessionStore } from "../../../src/store/session";
import { NAV_ICONS } from "../../../src/design/icons/nav-icon";

// v1 lists every SUBMITTED, REVIEWED and RETURNED row, in that order (B3-8).
const ALL = { pendingOnly: false } as const;
const PENDING = { pendingOnly: true } as const;

/** A positive integer season id from the route, or undefined for any other value. */
function seasonParam(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * v1 components/assignments/leader-queue-list.tsx columns. The queue item
 * carries no student email, so the second line is the group alone (gap note).
 */
function columns(): DataTableColumn<SubmissionQueueItem>[] {
  return [
    {
      key: "student",
      header: "Student",
      cell: (r) => (
        <View className="flex-col">
          <Text className="font-medium text-foreground">{r.studentName ?? "Student"}</Text>
          {r.groupName ? <Text className="text-xs text-muted-foreground">{r.groupName}</Text> : null}
        </View>
      ),
    },
    { key: "assignment", header: "Assignment", cell: (r) => r.assignmentTitle },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <View className="flex-row items-center gap-1.5">
          <SubmissionStatusBadge status={r.status} />
          {r.isLate ? <Badge variant="warning">Late</Badge> : null}
        </View>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (r) =>
        r.submittedAt ? (
          <Text className="text-sm text-muted-foreground">{formatShortDateTime(r.submittedAt)}</Text>
        ) : (
          <Text className="text-sm italic text-muted-foreground">—</Text>
        ),
    },
  ];
}

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
  const { data, isPending, isError, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSubmissionQueue(PENDING, true);

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
          <EmptyState icon={NAV_ICONS.submissions} title="All caught up" description="No submissions waiting for review." />
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

/** v1 app/leader/submissions/page.tsx — the leader's review queue. */
export default function SubmissionsScreen() {
  const router = useRouter();
  const prefetch = usePrefetchSubmission();
  const role = useSessionStore((s) => s.user?.role ?? null);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";
  // Set when opened from the dashboard's Assignments card, whose figures are
  // one season's: the queue narrows to match. From the tab bar it is absent
  // and the queue is v1's cross-season list.
  const seasonId = seasonParam(useLocalSearchParams<{ seasonId?: string }>().seasonId);
  const { data, isPending, isError, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSubmissionQueue(seasonId === undefined ? ALL : { ...ALL, seasonId }, role === "LEADER");

  if (isStaff && role !== "LEADER") return <PendingQueue />;
  if (!isStaff) {
    return (
      <ShellFrame>
        <EmptyState icon={NAV_ICONS.submissions} title="Submissions" description="This screen isn't available for your role." />
      </ShellFrame>
    );
  }

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  // Counts ignore paging and pendingOnly; only the first page carries them.
  const counts = data?.pages[0]?.counts;
  const open = (publicId: string) => router.push({ pathname: "/submission/[publicId]", params: { publicId } });

  return (
    <ShellFrame refreshing={isRefetching} onRefresh={() => void refetch()}>
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <View className="flex-col gap-4">
          <PageTitle
            title="Submissions"
            subtitle={
              counts
                ? `${counts.pending} pending review · ${counts.total} total${counts.late > 0 ? ` · ${counts.late} late` : ""}`
                : undefined
            }
          />
          {seasonId !== undefined ? (
            // The tab keeps its params, so a season filter set from the
            // dashboard must be visible and removable, not a silent state.
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-sm text-muted-foreground">Current season only</Text>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onPress={() => router.setParams({ seasonId: undefined })}
              >
                Show all seasons
              </Button>
            </View>
          ) : null}
          <DataTable
            columns={columns()}
            rows={items}
            rowKey={(r) => r.publicId}
            onRowPress={(r) => open(r.publicId)}
            onRowPressIn={(r) => prefetch(r.publicId)}
            emptyState={
              <EmptyState
                icon={NAV_ICONS.submissions}
                title="No submissions yet"
                description="Submissions from students in your groups will appear here."
              />
            }
          />
          {/* Paging is v2's (spec 08 D12); v1 loaded every row. */}
          {hasNextPage ? (
            <Button
              variant="outline"
              className="self-center"
              disabled={isFetchingNextPage}
              onPress={() => void fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </View>
      )}
    </ShellFrame>
  );
}
