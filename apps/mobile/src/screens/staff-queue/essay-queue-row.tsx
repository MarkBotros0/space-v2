import { useRouter } from "expo-router";
import type { SubmissionQueueItem } from "@space/shared";

import { ListRow } from "../../design/ui/grouped-list";
import { StatusChip, type ChipSpec } from "../../design/ui/status-chip";
import { usePrefetchSubmission } from "../../hooks/use-submission";
import { formatShortDateTime } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";
import { essayStatusChip } from "../submission-review/essay-status";

/**
 * One essay waiting in a reviewer's queue: the student, the assignment, the
 * essay's question, then its status, Late and when it was handed in as chips
 * that wrap under the text. Opens that essay (its work's publicId).
 */
export function EssayQueueRow({ item }: { item: SubmissionQueueItem }) {
  const router = useRouter();
  const prefetch = usePrefetchSubmission();
  const chips: ChipSpec[] = [
    essayStatusChip(item.reviewStatus),
    ...(item.isLate ? [{ tone: "warn" as const, label: "Late" }] : []),
    ...(item.submittedAt
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

/** The queue's header, counted over everything in reach: "2 essays waiting review · 5 handed in · 1 late". */
export function queueCountsLine(counts: { pending: number; total: number; late: number }): string {
  return joinMeta([
    `${plural(counts.pending, "essay")} waiting review`,
    `${counts.total} handed in`,
    counts.late > 0 && `${counts.late} late`,
  ]);
}
