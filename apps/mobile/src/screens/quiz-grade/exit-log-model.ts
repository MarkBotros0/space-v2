import { MAX_EXITS, type QuizGradingAttempt, type QuizGradingEvent } from "@space/shared";

import { joinMeta } from "../../lib/join-meta";
import { formatSessionTime } from "../../lib/format";

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
 * How long the student was away, as words, never a clock reading (owner, 2026-11-13: "0:32" read
 * like a time of day): "under a second", "32 sec", "2 min 5 sec", "1 h 4 min".
 */
export function awayFor(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total === 0) return "under a second";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return sec > 0 ? `${m} min ${sec} sec` : `${m} min`;
  return `${sec} sec`;
}

/** How many times the student left (counted exits and app closes), for the log's heading. */
export function exitSummary(events: QuizGradingEvent[]): string {
  const left = events.filter((e) => e.kind !== "SCREENSHOT").length;
  const shots = events.length - left;
  const parts = [
    left === 0 ? "Never left the quiz" : left === 1 ? "Left the quiz once" : `Left the quiz ${left} times`,
    shots === 0 ? null : shots === 1 ? "1 screenshot" : `${shots} screenshots`,
  ];
  return joinMeta(parts.filter((p): p is string => p !== null));
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
    if (e.kind === "SCREENSHOT") return `Took a screenshot at ${time}`;
    const left = e.kind === "RELAUNCH" ? `Closed the app at ${time}` : `Left at ${time}`;
    if (i === ending) return joinMeta([left, "this ended the attempt"]);
    if (e.returnedAt === null) return joinMeta([left, "didn't come back"]);
    return joinMeta([left, `back after ${awayFor(Date.parse(e.returnedAt) - Date.parse(e.leftAt))}`]);
  });
}
