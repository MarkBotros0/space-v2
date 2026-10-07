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

const dayKeyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The organisation-calendar day an instant falls on, as "YYYY-MM-DD".
 *
 * Ruling X13 / C2: "which day does this belong to" resolves against the org
 * timezone, server-side, once. The calendar groups sessions by this key; a
 * client grouping by its own device zone would file a 23:30Z session under
 * the wrong day for every viewer east of UTC. Built from formatToParts rather
 * than a locale whose default pattern happens to be ISO-shaped, so a
 * locale-data change cannot reorder the fields.
 */
export function orgDayKey(date: Date): string {
  const parts: Record<string, string> = {};
  for (const part of dayKeyFormatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const ORG_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ORG_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `HH:mm` on the organisation's clock — the inverse of the time half of orgWallClockToInstant. */
export function orgWallTime(date: Date): string {
  const p = orgWallClock(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * The instant at which the organisation's clock reads `day` at `time`
 * (`null` = midnight). The one place a wall-clock deadline becomes an instant
 * (ruling C2): v1 did this with `setHours` in the author's browser, so the
 * stored instant depended on where the admin was sitting (spec 07 R45).
 * Validates its own input — the shared schemas already have, but a malformed
 * value reaching here would otherwise normalise silently (Date.UTC rolls
 * "24:00" into the next day).
 */
export function orgWallClockToInstant(day: string, time: string | null): Date {
  const d = ORG_DAY_RE.exec(day);
  const t = ORG_TIME_RE.exec(time ?? "00:00");
  if (!d || !t) throw new RangeError(`Not an organisation wall clock: ${day} ${time ?? ""}`);
  return fromOrgWallClock({
    year: Number(d[1]),
    month: Number(d[2]),
    day: Number(d[3]),
    hour: Number(t[1]),
    minute: Number(t[2]),
    second: 0,
    millisecond: 0,
  });
}

/**
 * Is this instant midnight on the organisation's clock?
 *
 * Midnight is v1's only encoding of "all-day" — there is no `allDay` column and
 * adding one is a migration (ruling C1). v1 re-derived this in three separate
 * files with `getHours() !== 0 || getMinutes() !== 0`, each in the *viewer's*
 * timezone, against an instant the *server* had composed (spec 15 R19/R20), so
 * an all-day event stopped reading as all-day for anyone in another zone.
 * Ruling C2/X13: one zone, server-side, once. Plan 5's
 * `orgWallClockToInstant(day, null)` produces exactly these instants.
 */
export function isOrgMidnight(date: Date): boolean {
  const p = orgWallClock(date);
  return p.hour === 0 && p.minute === 0 && p.second === 0;
}

/**
 * A calendar day in the organisation's zone — "Mar 1, 2020".
 *
 * Used for spreadsheet column headers and filenames, which the SERVER writes
 * and no client can reformat. Ruling C2: every wall-clock derivation resolves
 * against one configured organisation timezone, never the host's incidental
 * one and never the reader's device.
 *
 * The YEAR is deliberate. v1 formatted these as `MMM d` (reports-query.ts:106,
 * season-export.ts:106), so sessions from different years collapsed onto the
 * same label and a mentor's all-season chart interleaved them silently
 * (R15, R68, spec D12).
 */
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: config.orgTimezone,
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDayInOrgTime(date: Date): string {
  return dayFormatter.format(date);
}
