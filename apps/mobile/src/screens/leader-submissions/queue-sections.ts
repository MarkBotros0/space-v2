import type { SubmissionQueueItem } from "@space/shared";

/** Waiting = an essay handed in and awaiting a verdict; everything else is done. Order kept. */
export function queueSections(items: SubmissionQueueItem[]): {
  waiting: SubmissionQueueItem[];
  done: SubmissionQueueItem[];
} {
  return {
    waiting: items.filter((i) => i.reviewStatus === "SUBMITTED"),
    done: items.filter((i) => i.reviewStatus !== "SUBMITTED"),
  };
}
