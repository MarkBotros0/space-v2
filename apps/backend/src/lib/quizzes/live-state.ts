import type { QuizLiveState } from "../../../../../packages/shared/src/index";

type AttemptFacts = {
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  endReason: "SUBMITTED" | "TIMED_OUT" | "ENDED_BY_STAFF" | "ENDED_BY_EXITS" | null;
};

/**
 * Where a student is on the live screen, from their latest attempt (none = not started).
 * The end reason wins over the status: a timed-out attempt is `timed_out` whether or
 * not its saved answers were marked at once. A legacy attempt (no reason) maps by status.
 * A reopened timed attempt not yet started is IN_PROGRESS too, with no deadline.
 */
export function liveState(attempt: AttemptFacts | null): QuizLiveState {
  if (attempt === null) return "not_started";
  if (attempt.status === "IN_PROGRESS") return "in_progress";
  switch (attempt.endReason) {
    case "TIMED_OUT":
      return "timed_out";
    case "ENDED_BY_EXITS":
      return "ended_by_exits";
    case "ENDED_BY_STAFF":
      return "ended_by_staff";
    default:
      return attempt.status === "GRADED" ? "graded" : "submitted";
  }
}
