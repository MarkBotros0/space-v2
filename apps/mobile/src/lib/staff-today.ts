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
 * "Over" is decided on the org's calendar day when `today` (the server's todayOrgDay)
 * is given: a session whose dayKey is before it is over, after it is not. Within today
 * the instants still come from the device, so
 * the device's clock and a session that crosses org midnight, which reads as over once
 * the org's day moves on, are the remaining approximations. Without `today`, only the
 * device's instants decide.
 */

/** Over (ends at or before `now`, or on an earlier org day) and attendance not marked; newest first. */
export function unmarkedSessions(sessions: SessionListItem[], now: Date, today?: string): SessionListItem[] {
  const t = now.getTime();
  const over = (s: SessionListItem) => (today === undefined || s.dayKey === today ? endMs(s) <= t : s.dayKey < today);
  return sessions.filter((s) => over(s) && !s.attendanceMarked).sort((a, b) => startMs(b) - startMs(a) || b.id - a.id);
}
