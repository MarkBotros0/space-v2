import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { useSubmissionQueue } from "../../src/hooks/use-submission-queue";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * v1 parity 2026-10-09 (08-submissions R45): the queue lists SUBMITTED, REVIEWED
 * and RETURNED work (the API never returns a DRAFT), in v1's status-then-recency
 * order (v1 submissions-query.ts:126-127) — not pending-only.
 */
const ALL = { pendingOnly: false } as const;

/** v1 submission-status-badge.tsx labels. */
function statusLabel(status: SubmissionQueueItem["status"]): string {
  if (status === "REVIEWED") return "Reviewed";
  if (status === "RETURNED") return "Returned";
  if (status === "SUBMITTED") return "Submitted";
  return "Draft";
}

function QueueRow({ item }: { item: SubmissionQueueItem }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/submission/[publicId]", params: { publicId: item.publicId } })
      }
    >
      <Card style={{ marginBottom: theme.spacing.sm }}>
        <Text variant="heading">{item.assignmentTitle}</Text>
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${item.studentName ?? "Unnamed"} · ${item.groupName ?? "No group"}${item.isLate ? " · Late" : ""}`}
        </Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {statusLabel(item.status)}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function SubmissionsScreen() {
  const theme = useTheme();
  const role = useSessionStore((s) => s.user?.role ?? null);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";
  const { data, isPending, isError, refetch, isRefetching } = useSubmissionQueue(ALL, isStaff);

  if (!isStaff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Submissions" message="This screen isn't available for your role." />
      </Screen>
    );
  }

  const items = data?.items ?? [];
  const counts = data?.counts;

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {counts ? (
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${counts.pending} pending review · ${counts.total} total${counts.late > 0 ? ` · ${counts.late} late` : ""}`}
        </Text>
      ) : null}
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load the review queue." onRetry={refetch} />
      ) : items.length === 0 ? (
        // v1 leader-queue-list.tsx:72-75.
        <EmptyState
          title="No submissions yet"
          message="Submissions from students in your groups will appear here."
        />
      ) : (
        // v1 parity 2026-10-09 (R52): every row in one list, no "Load more".
        items.map((item) => <QueueRow key={item.publicId} item={item} />)
      )}
    </Screen>
  );
}
