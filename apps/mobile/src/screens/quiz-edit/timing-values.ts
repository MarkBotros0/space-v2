/**
 * The quiz details sheet's timing fields as text, and back to what `updateQuizRequestSchema` takes.
 * A window end is a day and a wall time on this phone's clock, the same clock the student's start
 * card shows them on (`formatSessionTime`); the wire carries the instant (ISO).
 */
import { format, isValid, parse } from "date-fns";

export type WindowEnd = { day: string; time: string } | null;

export interface TimingDraft {
  from: WindowEnd;
  until: WindowEnd;
  /** Minutes as typed; empty is no limit. */
  limit: string;
}

function endFromIso(iso: string | null): WindowEnd {
  if (iso === null) return null;
  const d = new Date(iso);
  return isValid(d) ? { day: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm") } : null;
}

function endToIso(end: WindowEnd): string | null {
  if (end === null) return null;
  const d = parse(`${end.day} ${end.time}`, "yyyy-MM-dd HH:mm", new Date());
  return isValid(d) ? d.toISOString() : null;
}

export function timingDraft(q: {
  startsFrom: string | null;
  startsUntil: string | null;
  timeLimitMinutes: number | null;
}): TimingDraft {
  return {
    from: endFromIso(q.startsFrom),
    until: endFromIso(q.startsUntil),
    limit: q.timeLimitMinutes === null ? "" : String(q.timeLimitMinutes),
  };
}

const sameInstant = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

/** A new end starts here: the start of a day for "from", its end for "until". */
export const DEFAULT_FROM_TIME = "09:00";
export const DEFAULT_UNTIL_TIME = "23:55";

/**
 * The timing part of the PATCH body: nothing that didn't change. A changed window sends both ends,
 * so the schema's `startsFrom < startsUntil` check sees the pair (a one-sided edit would be checked
 * only against the stored end, by the server). The limit is left out while `limitLocked`.
 */
export function timingBody(
  draft: TimingDraft,
  saved: { startsFrom: string | null; startsUntil: string | null; timeLimitMinutes: number | null },
  limitLocked: boolean,
): { startsFrom?: string | null; startsUntil?: string | null; timeLimitMinutes?: number | null } {
  const body: { startsFrom?: string | null; startsUntil?: string | null; timeLimitMinutes?: number | null } = {};
  const from = endToIso(draft.from);
  const until = endToIso(draft.until);
  if (!sameInstant(from, saved.startsFrom) || !sameInstant(until, saved.startsUntil)) {
    body.startsFrom = from;
    body.startsUntil = until;
  }
  const typed = draft.limit.trim();
  const limit = typed === "" ? null : Number(typed);
  if (!limitLocked && limit !== saved.timeLimitMinutes) body.timeLimitMinutes = limit;
  return body;
}
