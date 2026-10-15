import { useRouter } from "expo-router";
import { Inbox } from "lucide-react-native";
import { Pressable, View } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  SubmissionStatusBadge,
  Text,
  type DataTableColumn,
} from "../../src/design/ui";
import { useSubmissionQueue } from "../../src/hooks/use-submission-queue";
import { formatShortDateTime } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";

// v1 lists every SUBMITTED, REVIEWED and RETURNED row, in that order (B3-8).
const ALL = { pendingOnly: false } as const;

/**
 * v1 components/assignments/leader-queue-list.tsx columns. The queue item
 * carries no student email, so the second line is the group alone (gap note).
 */
function columns(open: (publicId: string) => void): DataTableColumn<SubmissionQueueItem>[] {
  return [
    {
      key: "student",
      header: "Student",
      cell: (r) => (
        <View className="flex-col">
          <Pressable accessibilityRole="link" className="self-start" onPress={() => open(r.publicId)}>
            <Text className="font-medium text-foreground">{r.studentName ?? "Student"}</Text>
          </Pressable>
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

/** v1 app/leader/submissions/page.tsx — the review queue for every staff role. */
export default function SubmissionsScreen() {
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";
  const { data, isPending, isError, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSubmissionQueue(ALL, isStaff);

  if (!isStaff) {
    return (
      <ShellFrame>
        <EmptyState icon={Inbox} title="Submissions" description="This screen isn't available for your role." />
      </ShellFrame>
    );
  }

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  // Counts ignore paging and pendingOnly, so any page carries the same figures.
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
          <DataTable
            columns={columns(open)}
            rows={items}
            rowKey={(r) => r.publicId}
            emptyState={
              <EmptyState
                icon={Inbox}
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
