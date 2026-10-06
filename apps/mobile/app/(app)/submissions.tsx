import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { useSubmissionQueue } from "../../src/hooks/use-submission-queue";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

const PENDING = { pendingOnly: true } as const;

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
      </Card>
    </Pressable>
  );
}

export default function SubmissionsScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // STUDENT gets 403 from GET /submissions; no user means nothing to ask for.
  const isStaff = role !== null && role !== "STUDENT";
  const { data, isPending, isError, refetch, isRefetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSubmissionQueue(PENDING, isStaff);

  if (!isStaff) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Submissions" message="This screen isn't available for your role." />
      </Screen>
    );
  }

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={() => void refetch()} refreshing={isRefetching}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load the review queue." onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="All caught up" message="No submissions waiting for review." />
      ) : (
        <>
          {items.map((item) => (
            <QueueRow key={item.publicId} item={item} />
          ))}
          {hasNextPage ? (
            <Button
              title="Load more"
              variant="secondary"
              onPress={() => void fetchNextPage()}
              loading={isFetchingNextPage}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
