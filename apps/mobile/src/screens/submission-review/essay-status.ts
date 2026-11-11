import type { SubmissionStatus } from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";

const ESSAY: Record<SubmissionStatus, ChipSpec> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  SUBMITTED: { tone: "info", label: "Waiting review" },
  REVIEWED: { tone: "ok", label: "Reviewed" },
  RETURNED: { tone: "warn", label: "Returned" },
};

/** One essay's review status in a reviewer's words: the queues and the review screen share it. */
export function essayStatusChip(status: SubmissionStatus): ChipSpec {
  return ESSAY[status];
}
