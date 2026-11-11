import type { QuizLiveRow, QuizLiveState } from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";
import { formatRemaining, remainingMs } from "../quiz-detail/countdown";
import { endReasonLine } from "../quiz-grade/exit-log-model";

/*
 * The staff live screen's pure model (spec "Live screen"): where every student in scope is right
 * now. The countdown is read on the server's clock (`offsetMs`, as the student's own countdown).
 */

type LiveSummary = { notStarted: number; inProgress: number; finished: number; withExits: number };

export function liveSummary(rows: QuizLiveRow[]): LiveSummary {
  const count = (pick: (r: QuizLiveRow) => boolean) => rows.filter(pick).length;
  return {
    notStarted: count((r) => r.state === "not_started"),
    inProgress: count((r) => r.state === "in_progress"),
    finished: count((r) => r.state !== "not_started" && r.state !== "in_progress"),
    withExits: count((r) => r.exits > 0),
  };
}

const CHIPS: Record<QuizLiveState, ChipSpec> = {
  not_started: { tone: "neutral", label: "Not started" },
  in_progress: { tone: "info", label: "In progress" },
  submitted: { tone: "neutral", label: "Submitted" },
  graded: { tone: "ok", label: "Graded" },
  timed_out: { tone: "warn", label: "Timed out" },
  ended_by_exits: { tone: "bad", label: "Ended" },
  ended_by_staff: { tone: "neutral", label: "Ended" },
};

const exitCount = (r: QuizLiveRow) => r.exits > 0 && plural(r.exits, "exit");

/** In progress: time left (or why there is none), then the exits so far. */
function inProgressDetail(r: QuizLiveRow, offsetMs: number, now: number, timed: boolean): string {
  if (r.deadlineAt !== null) {
    return joinMeta([`${formatRemaining(remainingMs(r.deadlineAt, offsetMs, now))} left`, exitCount(r)]);
  }
  // A reopened timed attempt has no deadline until the student starts it again.
  if (timed) return "Retake not started";
  return joinMeta(["No time limit", exitCount(r)]);
}

function rowDetail(r: QuizLiveRow, offsetMs: number, now: number, timed: boolean): string {
  switch (r.state) {
    case "not_started":
      return "Hasn't opened the quiz";
    case "in_progress":
      return inProgressDetail(r, offsetMs, now, timed);
    case "submitted":
    case "graded":
      return r.exits > 0 ? plural(r.exits, "exit") : "No exits";
    case "timed_out":
      return joinMeta([endReasonLine("TIMED_OUT", null), exitCount(r)]);
    case "ended_by_exits":
      return endReasonLine("ENDED_BY_EXITS", null) ?? "";
    case "ended_by_staff":
      return endReasonLine("ENDED_BY_STAFF", null) ?? "";
  }
}

export type LiveRowView = { title: string; stateChip: ChipSpec; detail: string };

/** One student's row; `timed` is whether the quiz has a time limit. */
export function liveRowView(row: QuizLiveRow, offsetMs: number, now: number, timed: boolean): LiveRowView {
  return {
    title: row.studentName ?? "Student",
    stateChip: CHIPS[row.state],
    detail: rowDetail(row, offsetMs, now, timed),
  };
}

/** What staff can do for a row: End an open attempt, Reopen a finished one, nothing before a start. */
export function liveRowAction(row: QuizLiveRow): "end" | "reopen" | null {
  if (row.state === "not_started") return null;
  return row.state === "in_progress" ? "end" : "reopen";
}
