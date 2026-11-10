import { format, isValid, parse } from "date-fns";

/**
 * Org-day keys ("yyyy-MM-dd") and wall times ("HH:mm") to and from the
 * pickers' Dates. No time zone anywhere (ruling X13): a key names a day on the
 * org's wall, never an instant.
 */

/** A day key as a local Date for a picker, or null for an empty or malformed key. */
export function dayToDate(day: string | null): Date | null {
  if (day === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = parse(day, "yyyy-MM-dd", new Date());
  return isValid(date) ? date : null;
}

/** A picked Date back to the org-day key. */
export function dateToDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

interface TimeParts {
  hour: number;
  minute: number;
}

/** "HH:mm" as hour and minute, or `fallback` when it isn't one. */
export function timeToParts(time: string, fallback: TimeParts): TimeParts {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : fallback;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function partsToTime({ hour, minute }: TimeParts): string {
  return `${pad(hour)}:${pad(minute)}`;
}
