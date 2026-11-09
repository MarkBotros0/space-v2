import { db } from "../db/client";

import { bestEffort } from "./best-effort";
import { createNotificationsBulk } from "./notifications";
import { formatInOrgTime } from "./org-time";
import { notificationLink } from "./notification-target";

/** Same destination as SESSION_RESCHEDULED: the calendar (X1 link shape). */
const SESSION_CANCELLED_LINK = notificationLink.studentCalendar();

/** How many cancelled dates a series notice spells out before "and N more". */
const LISTED_DATES = 8;

interface SessionCancelledNotice {
  recipientIds: number[];
  title: string;
  body?: string;
}

/**
 * Who to tell, and what, about deleting these sessions. Must run BEFORE the
 * delete: afterwards the titles and times are gone.
 *
 * Only sessions that have not started yet count as cancelled. Deleting a past
 * session is record-keeping, and "Cancelled: … on <last week>" would tell
 * every student something false. No upcoming session → no notice.
 *
 * Recipients: every ACTIVE enrolment in an ACTIVE season (the SESSION_RESCHEDULED
 * audience — a session belongs to the whole season, not to a group) plus the
 * leaders of the season's groups, who would otherwise turn up to run it.
 * Deleted accounts are skipped.
 *
 * One notice per delete, never one per session: a series delete of ten weeks
 * is one decision, and ten pushes for it would be noise. Gathering never
 * throws into the delete (spec D6); a failure is logged and yields null.
 */
export async function prepareSessionCancelledNotice(
  seasonId: number,
  sessionIds: number[],
  now: Date = new Date(),
): Promise<SessionCancelledNotice | null> {
  let notice: SessionCancelledNotice | null = null;
  await bestEffort("notify:SESSION_CANCELLED (gather)", async () => {
    const sessions = await db.session.findMany({
      where: { id: { in: sessionIds }, startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true },
    });
    const first = sessions[0];
    if (!first) return;

    const [enrolled, leaders] = await Promise.all([
      db.seasonEnrollment.findMany({
        where: { seasonId, status: "ACTIVE", season: { status: "ACTIVE" }, studentUser: { deletedAt: null } },
        select: { studentUserId: true },
      }),
      db.groupLeader.findMany({
        where: { group: { seasonId, season: { status: "ACTIVE" } }, user: { deletedAt: null } },
        select: { userId: true },
      }),
    ]);
    const recipientIds = [...new Set([...enrolled.map((e) => e.studentUserId), ...leaders.map((l) => l.userId)])];
    if (recipientIds.length === 0) return;

    // Org wall clock (C2), formatted as the SESSION_RESCHEDULED notice is.
    const when = (s: { title: string; startsAt: Date }) =>
      s.title === first.title ? formatInOrgTime(s.startsAt) : `${s.title}, ${formatInOrgTime(s.startsAt)}`;
    const title = `Cancelled: ${first.title} on ${formatInOrgTime(first.startsAt)}`;

    if (sessions.length === 1) {
      notice = { recipientIds, title };
      return;
    }
    const listed = sessions.slice(0, LISTED_DATES).map(when).join("; ");
    const more = sessions.length - LISTED_DATES;
    notice = {
      recipientIds,
      title: `${title} and ${sessions.length - 1} more`,
      body: `${sessions.length} sessions cancelled: ${listed}${more > 0 ? `; and ${more} more` : ""}.`,
    };
  });
  return notice;
}

/** Send a prepared notice, after the delete has committed. Never rejects. */
export async function sendSessionCancelledNotice(notice: SessionCancelledNotice | null): Promise<void> {
  if (!notice) return;
  await bestEffort("notify:SESSION_CANCELLED", () =>
    createNotificationsBulk(notice.recipientIds, {
      type: "SESSION_CANCELLED",
      title: notice.title,
      body: notice.body,
      link: SESSION_CANCELLED_LINK,
    }),
  );
}
