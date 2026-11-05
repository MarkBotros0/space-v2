import type { SessionListItem } from "@space/shared";

/**
 * The four "needs action" counts on the ADMIN / SUPER Today screen.
 * `null` = unknown (the query failed or has not answered), never shown as 0.
 * `undefined` = does not apply to this role (ADMIN has no invites to send).
 */
export type NeedsAction = {
  pendingReview: number | null;
  unmarkedSessions: number | null;
  atRisk: number | null;
  pendingInvites: number | null | undefined;
};

const MINUTE_MS = 60_000;

function startMs(s: SessionListItem): number {
  return Date.parse(s.startsAt);
}

function endMs(s: SessionListItem): number {
  return startMs(s) + s.durationMinutes * MINUTE_MS;
}

/*
 * Past, live and upcoming are compared on the org's calendar day when `today` (the
 * server's todayOrgDay) is given: a session's dayKey before it has started and is over,
 * after it has not started. Within today the instants still come from the device, so
 * the device's clock and a session that crosses org midnight, which reads as over once
 * the org's day moves on, are the remaining approximations. Without `today`, only the
 * device's instants decide.
 */

/** Over (ends at or before `now`, or on an earlier org day) and attendance not marked; newest first. */
export function unmarkedSessions(
  sessions: SessionListItem[],
  now: Date,
  today?: string,
): SessionListItem[] {
  const t = now.getTime();
  const over = (s: SessionListItem) =>
    today === undefined || s.dayKey === today ? endMs(s) <= t : s.dayKey < today;
  return sessions
    .filter((s) => over(s) && !s.attendanceMarked)
    .sort((a, b) => startMs(b) - startMs(a) || b.id - a.id);
}

/** Started and not yet over: startsAt <= now < end, on the org's today. Overlapping sessions all count. */
export function liveSessions(sessions: SessionListItem[], now: Date, today?: string): SessionListItem[] {
  const t = now.getTime();
  return sessions
    .filter((s) => (today === undefined || s.dayKey === today) && startMs(s) <= t && t < endMs(s))
    .sort((a, b) => startMs(a) - startMs(b) || a.id - b.id);
}

/** The earliest session that starts after `now` (or on a later org day than `today`). */
export function nextSession(sessions: SessionListItem[], now: Date, today?: string): SessionListItem | null {
  const t = now.getTime();
  const later = (s: SessionListItem) =>
    today === undefined || s.dayKey === today ? startMs(s) > t : s.dayKey > today;
  let best: SessionListItem | null = null;
  for (const s of sessions) {
    if (!later(s)) continue;
    if (best === null || startMs(s) < startMs(best)) best = s;
  }
  return best;
}

/** True only when every applicable count is exactly 0; any unknown (null) is false. */
export function hasNothingToDo(n: NeedsAction): boolean {
  return [n.pendingReview, n.unmarkedSessions, n.atRisk, n.pendingInvites].every(
    (c) => c === undefined || c === 0,
  );
}
