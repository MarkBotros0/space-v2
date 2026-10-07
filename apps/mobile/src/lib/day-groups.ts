import type { JpcEventListItem, SessionListItem } from "@space/shared";

export interface DayGroup {
  dayKey: string;
  sessions: SessionListItem[];
}

/**
 * Groups by the server's `dayKey` (ruling X13) — never by formatting
 * `startsAt` on the device. Input is ordered by `startsAt`, so consecutive
 * rows sharing a key are one day. (Plan 4's calendar helper, moved here so
 * Plan 14's events merge can reuse it.)
 */
export function groupSessionsByDay(sessions: SessionListItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const s of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.dayKey === s.dayKey) last.sessions.push(s);
    else groups.push({ dayKey: s.dayKey, sessions: [s] });
  }
  return groups;
}

export type CalendarEntry =
  | { kind: "session"; at: number; session: SessionListItem }
  | { kind: "event"; at: number; event: JpcEventListItem };

export interface CalendarDayGroup {
  dayKey: string;
  entries: CalendarEntry[];
}

/**
 * Sessions and JPC events in one list of org-day buckets (Plan 14). Both are
 * keyed by the **server's** `dayKey` (ruling X13) — the same `orgDayKey` on the
 * backend — so one day's sessions and events share a bucket by construction.
 * Days sort as ISO strings; entries within a day by instant (zone-independent),
 * so a 09:00 event precedes an 18:00 session. Unlike `groupSessionsByDay` this
 * cannot rely on input order: the two arrays arrive separately.
 */
export function groupCalendarByDay(
  sessions: SessionListItem[],
  events: JpcEventListItem[],
): CalendarDayGroup[] {
  const byDay = new Map<string, CalendarEntry[]>();
  const add = (dayKey: string, entry: CalendarEntry) => {
    const list = byDay.get(dayKey);
    if (list) list.push(entry);
    else byDay.set(dayKey, [entry]);
  };
  for (const s of sessions) add(s.dayKey, { kind: "session", at: Date.parse(s.startsAt), session: s });
  for (const e of events) add(e.dayKey, { kind: "event", at: Date.parse(e.date), event: e });
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dayKey, entries]) => ({ dayKey, entries: entries.sort((x, y) => x.at - y.at) }));
}
