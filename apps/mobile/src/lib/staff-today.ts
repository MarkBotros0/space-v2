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

/** Over (ends at or before `now`) and attendance not marked; newest first. */
export function unmarkedSessions(sessions: SessionListItem[], now: Date): SessionListItem[] {
  const t = now.getTime();
  return sessions
    .filter((s) => endMs(s) <= t && !s.attendanceMarked)
    .sort((a, b) => startMs(b) - startMs(a) || b.id - a.id);
}

/** Started and not yet over: startsAt <= now < end. Overlapping sessions all count. */
export function liveSessions(sessions: SessionListItem[], now: Date): SessionListItem[] {
  const t = now.getTime();
  return sessions
    .filter((s) => startMs(s) <= t && t < endMs(s))
    .sort((a, b) => startMs(a) - startMs(b) || a.id - b.id);
}

/** The earliest session that starts after `now`. */
export function nextSession(sessions: SessionListItem[], now: Date): SessionListItem | null {
  const t = now.getTime();
  let best: SessionListItem | null = null;
  for (const s of sessions) {
    if (startMs(s) <= t) continue;
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
