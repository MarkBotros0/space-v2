import { format, formatDistanceToNowStrict, isValid, parse, parseISO } from "date-fns";

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

/** e.g. "Wed, Apr 1, 2026 · 6:00 PM" — when a marked session started. */
export function formatDateTime(iso: string | null): string {
  return formatIso(iso, "EEE, MMM d, yyyy · h:mm a");
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

/** e.g. "Mon, Mar 2" — an org-day key as a week-row heading; same no-zone rule as formatDayKey. */
export function formatWeekdayDay(dayKey: string | null): string {
  if (dayKey == null) return PLACEHOLDER;
  const date = parse(dayKey, "yyyy-MM-dd", new Date());
  if (!isValid(date)) return PLACEHOLDER;
  return format(date, "EEE, MMM d");
}

/**
 * e.g. "11:59 PM" — an organisation wall-clock time ("23:59") from the server.
 * Pure text arithmetic, no Date and no timezone: the server already resolved
 * the instant onto the org clock (ruling X13).
 */
export function formatWallTime(time: string | null): string {
  if (time == null) return PLACEHOLDER;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return PLACEHOLDER;
  const hour = Number(m[1]);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m[2] ?? "00"} ${hour < 12 ? "AM" : "PM"}`;
}

/** e.g. "Apr 1, 2099, 11:59 PM" — a deadline from the server's `dueOrgDay`/`dueOrgTime`. */
export function formatOrgDue(day: string | null, time: string | null): string {
  if (day == null) return "No due date";
  return time == null ? formatDayKey(day) : `${formatDayKey(day)}, ${formatWallTime(time)}`;
}

/**
 * e.g. "Jul 1, 2099 – Jul 5, 2099 · 6:30 PM" — a JPC event's when-label, built
 * only from the server's org-clock strings (`dayKey`, `endDayKey`, `time`;
 * ruling X13). `date`/`endDate` are never formatted on the device, so an
 * org-midnight event cannot move to the previous day west of the org zone.
 */
export function formatEventWhen(event: {
  dayKey: string;
  endDayKey: string | null;
  time: string | null;
}): string {
  const days =
    event.endDayKey && event.endDayKey !== event.dayKey
      ? `${formatDayKey(event.dayKey)} – ${formatDayKey(event.endDayKey)}`
      : formatDayKey(event.dayKey);
  return event.time !== null ? `${days} · ${formatWallTime(event.time)}` : days;
}

/**
 * The greeting's first name (spec 19 D21): first whitespace token of the
 * trimmed name, "there" when the name is null OR empty. v1's student and
 * alumni pages disagreed on exactly this.
 */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first : "there";
}

/**
 * "2 hours ago" — a RELATIVE label from an instant. The one thing the device
 * clock is good for (spec 19 D23); it buckets nothing by day.
 */
export function formatTimeAgo(iso: string | null): string {
  if (iso == null) return PLACEHOLDER;
  const date = parseISO(iso);
  if (!isValid(date)) return PLACEHOLDER;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

function formatDayKeyAs(dayKey: string | null, pattern: string): string {
  if (dayKey == null) return PLACEHOLDER;
  const date = parse(dayKey, "yyyy-MM-dd", new Date());
  if (!isValid(date)) return PLACEHOLDER;
  return format(date, pattern);
}

/** e.g. "Mar 13" — v1's short due badge; org day key, no zone (X13). */
export function formatShortDay(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "MMM d");
}

/** e.g. "Sunday, March 8" — v1's agenda day heading. */
export function formatLongDay(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "EEEE, MMMM d");
}

/** e.g. "Sunday, March 8, 2026" — v1's session hero date. */
export function formatLongDayYear(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "EEEE, MMMM d, yyyy");
}

/** e.g. "Sun, Mar 8, 2026" — v1's attendance row date. */
export function formatWeekdayDayYear(dayKey: string | null): string {
  return formatDayKeyAs(dayKey, "EEE, MMM d, yyyy");
}

/** "20:00" → { clock: "8:00", meridiem: "PM" } — v1's agenda time rail, as text (X13). */
export function splitWallTime(time: string | null): { clock: string; meridiem: string } {
  const whole = formatWallTime(time);
  if (whole === PLACEHOLDER) return { clock: PLACEHOLDER, meridiem: "" };
  const [clock = PLACEHOLDER, meridiem = ""] = whole.split(" ");
  return { clock, meridiem };
}

/** "20:00" + 90 → "21:30"; wraps past midnight. Text arithmetic on the org clock. */
export function addMinutesToWallTime(time: string | null, minutes: number): string | null {
  if (time == null) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  const total = (((Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "3 days" — v1's `formatDistanceToNowStrict` without a suffix ("Due in 3 days"). */
export function formatDistanceOnly(iso: string | null): string {
  if (iso == null) return PLACEHOLDER;
  const date = parseISO(iso);
  if (!isValid(date)) return PLACEHOLDER;
  return formatDistanceToNowStrict(date);
}

/** v1 upcoming-events-card whenLabel: "Mar 5 · 6:30 PM", "Mar 5 – Mar 7" (no year). */
export function formatEventWhenShort(event: { dayKey: string; endDayKey: string | null; time: string | null }): string {
  const start =
    event.time !== null ? `${formatShortDay(event.dayKey)} · ${formatWallTime(event.time)}` : formatShortDay(event.dayKey);
  if (event.endDayKey && event.endDayKey !== event.dayKey) return `${start} – ${formatShortDay(event.endDayKey)}`;
  return start;
}

/** v1's notification stamp: "Jul 8, 2026 · 1:57 PM · 3 months ago". */
export function formatStampAgo(iso: string | null): string {
  if (iso == null) return PLACEHOLDER;
  const date = parseISO(iso);
  if (!isValid(date)) return PLACEHOLDER;
  return `${format(date, "MMM d, yyyy · h:mm a")} · ${formatDistanceToNowStrict(date, { addSuffix: true })}`;
}
