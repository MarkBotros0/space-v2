/**
 * Port of v1 src/components/ui/submission-status-badge.tsx — same map.
 * Native differences: classes split between the pill View and its Text.
 */
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

type SubmissionStatus = "DRAFT" | "SUBMITTED" | "REVIEWED" | "RETURNED";

const map: Record<SubmissionStatus, { label: string; box: string; text: string }> = {
  DRAFT: { label: "Draft", box: "bg-muted dark:bg-neutral-800", text: "text-muted-foreground dark:text-neutral-300" },
  SUBMITTED: { label: "Submitted", box: "bg-info-100 dark:bg-info-950", text: "text-info-800 dark:text-info-200" },
  REVIEWED: { label: "Reviewed", box: "bg-success-100 dark:bg-success-950", text: "text-success-800 dark:text-success-200" },
  RETURNED: { label: "Returned", box: "bg-warning-100 dark:bg-warning-950", text: "text-warning-800 dark:text-warning-200" },
};

function SubmissionStatusBadge({ status, className }: { status: SubmissionStatus; className?: string }) {
  const entry = map[status];
  return (
    <View className={cn("flex-row items-center rounded-full px-2 py-0.5", entry.box, className)}>
      <Text numberOfLines={1} className={cn("text-xs font-medium", entry.text)}>
        {entry.label}
      </Text>
    </View>
  );
}

export { SubmissionStatusBadge };
export type { SubmissionStatus };
