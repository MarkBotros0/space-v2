import type { SessionListItem } from "@space/shared";

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
