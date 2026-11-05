import type { SubmissionQueueItem } from "@space/shared";

/** Waiting = SUBMITTED, awaiting a review; everything else is done. Order kept. */
export function queueSections(items: SubmissionQueueItem[]): {
  waiting: SubmissionQueueItem[];
  done: SubmissionQueueItem[];
} {
  return {
    waiting: items.filter((i) => i.status === "SUBMITTED"),
    done: items.filter((i) => i.status !== "SUBMITTED"),
  };
}
