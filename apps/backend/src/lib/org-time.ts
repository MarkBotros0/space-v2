import { config } from "./config";

/**
 * The one place wall-clock arithmetic and wall-clock text happen on the server.
 *
 * Ruling C2: v1 formatted timestamps with the host's incidental locale and
 * zone (`toLocaleString()` in the reschedule notification) and spaced weekly
 * recurrence with date-fns `addDays` in the host's zone, so both depended on
 * where the server ran. Everything wall-clock resolves against one configured
 * organisation timezone instead.
 */
const displayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  year: "numeric", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  hourCycle: "h23",
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric",
});

export interface OrgWallClock {
  year: number;
  /** 1–12 */
  month: number;
  /** May overflow (e.g. 35) when passed to fromOrgWallClock — Date.UTC normalises it. */
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export function formatInOrgTime(date: Date): string {
  return displayFormatter.format(date);
}

/** The org-zone calendar fields of an instant. */
export function orgWallClock(date: Date): OrgWallClock {
  const fields: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  return {
    year: fields.year ?? 0,
    month: fields.month ?? 1,
    day: fields.day ?? 1,
    hour: fields.hour ?? 0,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
    millisecond: date.getUTCMilliseconds(),
  };
}

/** Org-zone UTC offset in ms at an instant (whole seconds; zones have no sub-second offsets). */
function offsetAt(instantMs: number): number {
  const p = orgWallClock(new Date(instantMs));
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - (instantMs - p.millisecond);
}

/**
 * The instant at which the org zone's clock reads `parts`. Two passes: the
 * first guesses with the offset at the naive instant, the second corrects
 * with the offset at the guess, which is right on both sides of a
 * transition. A wall time skipped by spring-forward resolves one hour later.
 */
export function fromOrgWallClock(parts: OrgWallClock): Date {
  const naive = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond,
  );
  const guess = naive - offsetAt(naive);
  return new Date(naive - offsetAt(guess));
}

/**
 * `start` moved by `weeks` calendar weeks in the org zone: same weekday, same
 * wall-clock time. Across a DST boundary the UTC instant shifts by the
 * offset change; that is the point (X13).
 */
export function addWeeksInOrgTime(start: Date, weeks: number): Date {
  const p = orgWallClock(start);
  return fromOrgWallClock({ ...p, day: p.day + weeks * 7 });
}
