import type { QuizLiveRow, QuizLiveState } from "@space/shared";

import type { ChipSpec } from "../../design/ui/status-chip";
import { joinMeta } from "../../lib/join-meta";
import { plural } from "../../lib/plural";
import { formatRemaining, minutesLeftLabel, remainingMs } from "../quiz-detail/countdown";

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

/** The detail line's facts: what the eye reads, and what a screen reader hears. */
type Facts = { shown: (string | false)[]; spoken: (string | false)[] };
const same = (parts: (string | false)[]): Facts => ({ shown: parts, spoken: parts });

/** In progress: time left (or why there is none), then the exits so far. */
function inProgressFacts(r: QuizLiveRow, offsetMs: number, now: number, timed: boolean): Facts {
  if (r.deadlineAt !== null) {
    const ms = remainingMs(r.deadlineAt, offsetMs, now);
    // Past the deadline, the server closes it on the next read or the scheduler's run.
    if (ms === 0) return same(["Time up", "closing"]);
    return { shown: [`${formatRemaining(ms)} left`, exitCount(r)], spoken: [minutesLeftLabel(ms), exitCount(r)] };
  }
  // A reopened timed attempt has no deadline until the student starts it again.
  if (timed) return same(["Retake not started"]);
  return same(["No time limit", exitCount(r)]);
}

/** The chip says the state; the detail adds what the chip doesn't. */
function rowFacts(r: QuizLiveRow, offsetMs: number, now: number, timed: boolean): Facts {
  switch (r.state) {
    case "not_started":
      return same(["Hasn't started"]);
    case "in_progress":
      return inProgressFacts(r, offsetMs, now, timed);
    case "submitted":
    case "graded":
      return same([r.exits > 0 ? plural(r.exits, "exit") : "No exits"]);
    case "timed_out":
      return same(["Time ran out", exitCount(r)]);
    case "ended_by_exits":
      return same(["Left the quiz"]);
    case "ended_by_staff":
      return same(["Ended by staff"]);
  }
}

export type LiveRowView = { title: string; stateChip: ChipSpec; detail: string; spoken: string };

const spokenJoin = (parts: (string | false)[]) => parts.filter((p): p is string => p !== false).join(", ");

/** One student's row; `timed` is whether the quiz has a time limit. `spoken` is the detail for a screen reader. */
export function liveRowView(row: QuizLiveRow, offsetMs: number, now: number, timed: boolean): LiveRowView {
  const facts = rowFacts(row, offsetMs, now, timed);
  return {
    title: row.studentName ?? "Student",
    stateChip: CHIPS[row.state],
    detail: joinMeta(facts.shown),
    spoken: spokenJoin(facts.spoken),
  };
}

/** What staff can do for a row: End an open attempt, Reopen a finished one, nothing before a start. */
export function liveRowAction(row: QuizLiveRow): "end" | "reopen" | null {
  if (row.state === "not_started") return null;
  return row.state === "in_progress" ? "end" : "reopen";
}
