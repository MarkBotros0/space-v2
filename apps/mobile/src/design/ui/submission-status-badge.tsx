/** A submission's status as a StatusChip (tones and labels from statusChip("submission")). */
import type { SubmissionStatus } from "@space/shared";

import { cn } from "../lib/cn";
import { StatusChip, statusChip } from "./status-chip";

function SubmissionStatusBadge({ status, className }: { status: SubmissionStatus; className?: string }) {
  return <StatusChip {...statusChip("submission", status)} className={cn("self-auto", className)} />;
}

export { SubmissionStatusBadge };
export type { SubmissionStatus };
