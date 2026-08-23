/**
 * Hard stop three hours after opening, so an admin who forgets to close a
 * session cannot leave a working code live indefinitely.
 *
 * v1 states this rule in two contradictory forms: its pages apply the three
 * hours, its own `/api/v1` route does not. The port inherited the REST form on
 * the read and the page form on the write, so `GET /sessions/:id` reported a
 * session opened three days ago as open while `POST /sessions/check-in`
 * rejected the resulting scan with `closed`. The enforcing form is the
 * authoritative one — an expiry that only the writer honours is still an
 * expiry, while one only the reader honours is decoration — so both callers
 * now derive their answer here and cannot drift apart again.
 */
export const CHECK_IN_WINDOW_MS = 3 * 60 * 60 * 1000;

export type CheckInState = "not_open" | "open" | "expired" | "closed";

export interface CheckInTimes {
  checkInOpenAt: Date | null;
  checkInClosedAt: Date | null;
}

/**
 * `expired` and `closed` both mean "no longer accepting scans"; they are
 * distinct so the write path can say which happened without re-deriving it.
 */
export function checkInState(session: CheckInTimes, now: Date = new Date()): CheckInState {
  if (!session.checkInOpenAt) return "not_open";
  if (session.checkInClosedAt) return "closed";
  if (now.getTime() - session.checkInOpenAt.getTime() > CHECK_IN_WINDOW_MS) return "expired";
  return "open";
}

export function isCheckInOpen(session: CheckInTimes, now: Date = new Date()): boolean {
  return checkInState(session, now) === "open";
}
