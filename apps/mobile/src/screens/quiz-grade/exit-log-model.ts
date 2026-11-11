import type { QuizGradingAttempt, QuizGradingEvent } from "@space/shared";

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

const isExit = (e: QuizGradingEvent) => e.kind === "EXIT" || e.kind === "RELAUNCH";

/**
 * The exit log, one line per event the phone reported, oldest first (spec "Marking"): when the
 * student left, and for how long. The last exit of an attempt ended by exits says it ended it;
 * an exit never reported back otherwise says the student didn't come back. Times are the device's.
 */
export function exitLogLines(events: QuizGradingEvent[], reason: EndReason): string[] {
  const lastExit = events.reduce((last, e, i) => (isExit(e) ? i : last), -1);
  return events.map((e, i) => {
    const time = formatSessionTime(e.leftAt);
    if (e.kind === "SCREENSHOT") return `Screenshot ${time}`;
    const left = e.kind === "RELAUNCH" ? `Closed the app ${time}` : `Left ${time}`;
    if (i === lastExit && reason === "ENDED_BY_EXITS") return joinMeta([left, "ended the attempt"]);
    if (e.returnedAt === null) return joinMeta([left, "didn't come back"]);
    return joinMeta([left, `away ${formatRemaining(Date.parse(e.returnedAt) - Date.parse(e.leftAt))}`]);
  });
}
