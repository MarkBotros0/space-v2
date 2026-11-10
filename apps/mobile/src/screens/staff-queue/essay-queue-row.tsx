import { useRouter } from "expo-router";
import { View } from "react-native";
import type { SubmissionQueueItem } from "@space/shared";

import { ListRow } from "../../design/ui/grouped-list";
import { StatusChip, type ChipSpec } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { usePrefetchSubmission } from "../../hooks/use-submission";
import { formatShortDateTime } from "../../lib/format";
import { plural } from "../../lib/plural";
import { essayStatusChip } from "../submission-review/essay-status";

/**
 * One essay waiting in a reviewer's queue: the student, the assignment, the
 * essay's question, then its status, Late and when it was handed in (or, once returned,
 * when it was returned) as chips that wrap under the text. Opens that essay (its work's publicId).
 */
type QueueCounts = { pending: number; total: number; late: number };

export function EssayQueueRow({ item }: { item: SubmissionQueueItem }) {
  const router = useRouter();
  const prefetch = usePrefetchSubmission();
  const chips: ChipSpec[] = [
    essayStatusChip(item.reviewStatus),
    ...(item.isLate ? [{ tone: "warn" as const, label: "Late" }] : []),
    // A returned essay is back with the student: its old hand-in date would mislead, so it
    // says when it was returned.
    ...(item.reviewStatus === "RETURNED"
      ? item.reviewedAt
        ? [{ tone: "neutral" as const, label: `Returned ${formatShortDateTime(item.reviewedAt)}` }]
        : []
      : item.submittedAt
        ? [{ tone: "neutral" as const, label: `Handed in ${formatShortDateTime(item.submittedAt)}` }]
        : []),
  ];
  return (
    <ListRow
      title={item.studentName ?? "Unnamed student"}
      titleLines={2}
      detail={item.assignmentTitle}
      subtitle={item.prompt}
      subtitleLines={3}
      footer={chips.map((chip) => (
        <StatusChip key={chip.label} {...chip} />
      ))}
      trailingLabel={chips.map((c) => c.label).join(", ")}
      chevron
      onPress={() => router.push({ pathname: "/submission/[publicId]", params: { publicId: item.publicId } })}
      onPressIn={() => prefetch(item.publicId)}
    />
  );
}

/** The screen's subtitle: the one number the queue is for, "2 essays waiting review". */
export function pendingLine(counts: QueueCounts): string {
  return `${plural(counts.pending, "essay")} waiting review`;
}

/**
 * The rest of the counts, one fact per line (never joined with a dot): "9 in all",
 * then "4 handed in late" when any were. "In all" counts every essay handed in,
 * reviewed and returned ones too.
 */
export function QueueTotals({ counts }: { counts: QueueCounts }) {
  return (
    <View className="gap-0.5">
      <Text variant="subhead" className="text-muted-foreground">{`${counts.total} in all`}</Text>
      {counts.late > 0 ? (
        <Text variant="subhead" className="text-muted-foreground">{`${counts.late} handed in late`}</Text>
      ) : null}
    </View>
  );
}
