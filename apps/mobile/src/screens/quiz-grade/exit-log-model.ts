import { MAX_EXITS, type QuizGradingAttempt, type QuizGradingEvent } from "@space/shared";

import { joinMeta } from "../../lib/join-meta";
import { formatSessionTime } from "../../lib/format";
import { formatRemaining } from "../quiz-detail/countdown";

type EndReason = QuizGradingAttempt["endReason"];

/** How an attempt ended, in the words staff read on the live screen and in the attempt sheet; null while open. */
export function endReasonLine(reason: EndReason, endedByName: string | null): string | null {
  switch (reason) {
    case "SUBMITTED":
      return "Submitted";
    case "TIMED_OUT":
      return "Timed out";
    case "ENDED_BY_EXITS":
      return joinMeta(["Ended", "left the quiz"]);
    case "ENDED_BY_STAFF":
      return `Ended by ${endedByName ?? "staff"}`;
    default:
      return null;
  }
}

/** An exit the server counted: EXIT or RELAUNCH, left before the deadline (one after it is only logged). */
const counts = (e: QuizGradingEvent, deadlineAt: string | null) =>
  (e.kind === "EXIT" || e.kind === "RELAUNCH") &&
  (deadlineAt === null || Date.parse(e.leftAt) < Date.parse(deadlineAt));

/** The index of the counted exit that ended the attempt: the MAX_EXITS-th, oldest first; -1 if none. */
function endingExit(events: QuizGradingEvent[], deadlineAt: string | null): number {
  let seen = 0;
  return events.findIndex((e) => counts(e, deadlineAt) && ++seen === MAX_EXITS);
}

/**
 * The exit log, one line per event the phone reported, oldest first (spec "Marking"): when the
 * student left, and for how long. On an attempt ended by exits the third counted exit says it ended
 * it; later ones in the same offline batch are logged like any other. An exit never reported back
 * otherwise says the student didn't come back. Times are the device's.
 */
export function exitLogLines(
  events: QuizGradingEvent[],
  reason: EndReason,
  deadlineAt: string | null = null,
): string[] {
  const ending = reason === "ENDED_BY_EXITS" ? endingExit(events, deadlineAt) : -1;
  return events.map((e, i) => {
    const time = formatSessionTime(e.leftAt);
    if (e.kind === "SCREENSHOT") return `Took a screenshot ${time}`;
    const left = e.kind === "RELAUNCH" ? `Closed the app ${time}` : `Left ${time}`;
    if (i === ending) return joinMeta([left, "ended the attempt"]);
    if (e.returnedAt === null) return joinMeta([left, "didn't come back"]);
    return joinMeta([left, `away ${formatRemaining(Date.parse(e.returnedAt) - Date.parse(e.leftAt))}`]);
  });
}
