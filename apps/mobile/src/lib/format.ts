import { format, isValid, parse, parseISO } from "date-fns";

// Every timestamp that crosses the wire (`dueAt`, `submittedAt`,
// `reviewedAt`, `checkedInAt`, session start times, ...) is a JSON ISO
// string, never a `Date` — and several of those fields are nullable. Every
// formatter here accepts `string | null` and returns this placeholder for
// `null` (or for a string that fails to parse) instead of throwing, so a
// screen can pass a raw field straight through without a null check first.
const PLACEHOLDER = "—";

function formatIso(iso: string | null, pattern: string): string {
  if (iso == null) return PLACEHOLDER;

  const date = parseISO(iso);
  if (!isValid(date)) return PLACEHOLDER;

  return format(date, pattern);
}

/** e.g. "6:00 PM" — the time a session starts. */
export function formatSessionTime(iso: string | null): string {
  return formatIso(iso, "h:mm a");
}

/** e.g. "Apr 1, 2026" — a generic date display. */
export function formatDate(iso: string | null): string {
  return formatIso(iso, "MMM d, yyyy");
}

/** e.g. "Apr 1, 2026" — an assignment's due date, rendered as a calendar day (no time). */
export function formatDueDate(iso: string | null): string {
  return formatIso(iso, "MMM d, yyyy");
}

/**
 * e.g. "Mar 1, 2099" — an org-calendar day key ("2099-03-01") from the server.
 *
 * No timezone conversion happens here, deliberately: the server already
 * resolved which day the instant belongs to in the org timezone (ruling X13).
 * `parse` builds a local-midnight Date from the key's own Y-M-D, and `format`
 * reads the same Y-M-D back, so the day cannot move whatever the device zone.
 */
export function formatDayKey(dayKey: string | null): string {
  if (dayKey == null) return PLACEHOLDER;
  const date = parse(dayKey, "yyyy-MM-dd", new Date());
  if (!isValid(date)) return PLACEHOLDER;
  return format(date, "MMM d, yyyy");
}
