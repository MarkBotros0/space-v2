/**
 * Calendar arithmetic on org-day keys ("YYYY-MM-DD") — Week and Month grids
 * (REG-75) and their cues (REG-76).
 *
 * Every function here works on the key's own Y-M-D through UTC arithmetic, so
 * the device zone can never move a session to another cell (ruling X13). Weeks
 * start on Monday, as v1's `weekStartsOn: 1`.
 */
import type { JpcEventListItem, SessionListItem } from "@space/shared";

export type CalendarView = "upcoming" | "week" | "month";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MS_PER_DAY = 86_400_000;

function toUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  return toKey(new Date(toUtc(key).getTime() + days * MS_PER_DAY));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY);
}

function mondayIndex(key: string): number {
  return (toUtc(key).getUTCDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -mondayIndex(key));
}

function firstOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

function lastOfMonth(key: string): string {
  const d = toUtc(firstOfMonth(key));
  return toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** The seven days (Mon-Sun) of the week holding `anchor`. */
export function weekKeys(anchor: string): string[] {
  const start = startOfWeek(anchor);
  return eachDay(start, addDays(start, 6));
}

/** Whole weeks covering the month holding `anchor`, Mon-Sun, so 28 to 42 days. */
export function monthGridKeys(anchor: string): string[] {
  return eachDay(startOfWeek(firstOfMonth(anchor)), addDays(startOfWeek(lastOfMonth(anchor)), 6));
}

export function visibleKeys(view: Exclude<CalendarView, "upcoming">, anchor: string): string[] {
  return view === "week" ? weekKeys(anchor) : monthGridKeys(anchor);
}

/** Previous/next week, or the first of the previous/next month. */
export function stepAnchor(view: Exclude<CalendarView, "upcoming">, anchor: string, dir: 1 | -1): string {
  if (view === "week") return addDays(anchor, 7 * dir);
  const d = toUtc(firstOfMonth(anchor));
  return toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1)));
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** "March 2099" for a month; "Mar 2 – 8" or "Feb 27 – Mar 5" for a week. */
export function rangeLabel(view: Exclude<CalendarView, "upcoming">, anchor: string): string {
  if (view === "month") {
    return `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
  }
  const keys = weekKeys(anchor);
  const first = keys[0] ?? anchor;
  const last = keys[6] ?? anchor;
  const short = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]?.slice(0, 3)} ${Number(k.slice(8, 10))}`;
  return isSameMonth(first, last)
    ? `${short(first)} – ${Number(last.slice(8, 10))}`
    : `${short(first)} – ${short(last)}`;
}

/**
 * The window to ask GET /sessions for so every visible day is covered.
 * The server owns org-day boundaries (C2), so the device pads one day each
 * side instead of guessing them, and files the response by its own `dayKey`.
 * A month grid is at most 42 days + padding, inside the 120-day cap.
 */
export function fetchWindow(keys: string[]): { from: string; to: string } {
  const first = keys[0] ?? "1970-01-01";
  const last = keys[keys.length - 1] ?? first;
  return { from: `${addDays(first, -1)}T00:00:00.000Z`, to: `${addDays(last, 2)}T00:00:00.000Z` };
}

export type SessionTone = "today" | "past" | "upcoming";

export function sessionTone(dayKey: string, today: string): SessionTone {
  if (dayKey === today) return "today";
  return dayKey < today ? "past" : "upcoming";
}

/** v1's agenda heading cue: "Today" or "in N days"; nothing for a past day. */
export function dayCue(dayKey: string, today: string): string | null {
  const n = daysBetween(today, dayKey);
  if (n < 0) return null;
  if (n === 0) return "Today";
  return n === 1 ? "in 1 day" : `in ${n} days`;
}

/** v1's session-card status badge. `attendance` is staff-only: a student has nothing to mark. */
export function sessionBadge(
  s: Pick<SessionListItem, "dayKey" | "attendanceMarked">,
  today: string,
  isStaff: boolean,
): string | null {
  const tone = sessionTone(s.dayKey, today);
  if (tone === "today") return "Today";
  if (tone === "upcoming") return "Upcoming";
  if (!isStaff) return null;
  return s.attendanceMarked ? "Attendance marked" : "Attendance pending";
}

/**
 * v1's SEASON_PALETTE slot (0-4) per season, in order of first appearance.
 * Pass the previous result so a season keeps its colour as the window moves;
 * v1 coloured one fixed list, a windowed phone view needs the memory.
 */
export function seasonSlots(
  sessions: Pick<SessionListItem, "seasonCode">[],
  previous: Record<string, number> = {},
): Record<string, number> {
  const slots = { ...previous };
  for (const { seasonCode } of sessions) {
    if (!(seasonCode in slots)) slots[seasonCode] = Object.keys(slots).length % 5;
  }
  return slots;
}

export interface DayContents {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
}

/** Files sessions and events under their server-assigned `dayKey`. */
export function bucketByDay(
  sessions: SessionListItem[],
  events: JpcEventListItem[],
): Map<string, DayContents> {
  const byDay = new Map<string, DayContents>();
  const at = (key: string) => {
    let day = byDay.get(key);
    if (!day) {
      day = { sessions: [], events: [] };
      byDay.set(key, day);
    }
    return day;
  };
  for (const s of sessions) at(s.dayKey).sessions.push(s);
  for (const e of events) at(e.dayKey).events.push(e);
  return byDay;
}

/** The device's calendar day: only a stand-in until the server's org-today is known. */
export function deviceTodayKey(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
