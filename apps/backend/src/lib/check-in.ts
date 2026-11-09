import { MS_PER_HOUR } from "./org-time";
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
export const CHECK_IN_WINDOW_MS = 3 * MS_PER_HOUR;

type CheckInState = "not_open" | "open" | "expired" | "closed";

interface CheckInTimes {
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

/**
 * Students see check-in, and may check in, only from an hour before the
 * session starts (owner, 2026-11-08). An admin may open it earlier (to put the
 * code up, say); until the hour it still reads as not open to students.
 */
export const STUDENT_CHECK_IN_LEAD_MS = MS_PER_HOUR;

export function isStudentCheckInWindow(startsAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= startsAt.getTime() - STUDENT_CHECK_IN_LEAD_MS;
}

/** What a student is told: open only while check-in is open and the session's hour has come. */
export function isCheckInOpenForStudent(session: CheckInTimes & { startsAt: Date }, now: Date = new Date()): boolean {
  return isCheckInOpen(session, now) && isStudentCheckInWindow(session.startsAt, now);
}
