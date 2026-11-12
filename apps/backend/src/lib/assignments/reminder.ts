import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import type { ReminderAnchor } from "../../generated/prisma/enums";
import { liveAssignment, liveSeason } from "../db/live";
import { notificationLink } from "../notification-target";
import { createNotificationsBulk } from "../notifications";
import {
  formatClockInOrgTime,
  formatShortDayInOrgTime,
  formatWeekdayInOrgTime,
  orgDayKey,
  orgDaysBeforeAt,
} from "../org-time";
import { seasonRosterMember } from "../queries/season-participants";
import { reportError } from "../sentry";
import { workStandings } from "./standing";
import { SUBMITTED_WHERE } from "./submitted";

/*
 * An assignment's reminder (spec, "Reminders"): `reminderDays` before the
 * anchor (the season's next session, or the due date) at `reminderTime` on the
 * organisation's clock, to the season's students who have not submitted; once
 * per assignment. Every write stores the send time in `remindAt`; the
 * scheduler's `assignment-reminders` handler sends it at the first request
 * after that time and stamps `remindedAt`, which also stops it moving again.
 */

type Client = Prisma.TransactionClient | typeof db;

/**
 * When the reminder goes out: the anchor's org day minus `days`, at `time` on
 * the org clock. Null when the anchor is missing (no due date, no session after
 * publication) or the time has already passed at save time.
 */
export function remindAtFor(input: {
  anchor: ReminderAnchor;
  days: number;
  time: string;
  dueAt: Date | null;
  nextSessionStartsAt: Date | null;
  now: Date;
}): Date | null {
  const anchorAt = input.anchor === "DUE_DATE" ? input.dueAt : input.nextSessionStartsAt;
  if (anchorAt === null) return null;
  const at = orgDaysBeforeAt(anchorAt, input.days, input.time);
  return at > input.now ? at : null;
}

/**
 * "The next session" (ruling I3): the first session of the season starting
 * after the assignment was published (`createdAt`), whether or not it has
 * passed since; never the first after now, or whether a reminder exists would
 * hang on unrelated later writes. Sessions have no soft delete; a cancelled
 * session is a deleted row.
 */
async function nextSessionStart(seasonId: number, createdAt: Date, client: Client): Promise<Date | null> {
  const next = await client.session.findFirst({
    where: { seasonId, startsAt: { gt: createdAt } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  return next?.startsAt ?? null;
}

/** What deciding an assignment's reminder needs: its season, deadline, settings and what is stored. */
interface ReminderSubject {
  seasonId: number;
  /** When it was published; the next session is the first after this. */
  createdAt: Date;
  dueAt: Date | null;
  reminderEnabled: boolean;
  reminderDays: number;
  reminderAnchor: ReminderAnchor;
  reminderTime: string;
  remindAt: Date | null;
  remindedAt: Date | null;
}

/** The `remindAt` to store, given the next session; see resolveRemindAt. */
function remindAtGiven(a: ReminderSubject, nextSessionStartsAt: Date | null, now: Date): Date | null {
  if (!a.reminderEnabled) return null;
  // Sent: once per assignment, so it never moves or comes back.
  if (a.remindedAt !== null) return a.remindAt;
  const anchorAt = a.reminderAnchor === "DUE_DATE" ? a.dueAt : nextSessionStartsAt;
  // Due but not swept yet (nobody has made a request since): keep it, or an
  // unrelated save in between would drop a reminder that is owed.
  if (anchorAt !== null && a.remindAt !== null) {
    if (orgDaysBeforeAt(anchorAt, a.reminderDays, a.reminderTime).getTime() === a.remindAt.getTime()) return a.remindAt;
  }
  return remindAtFor({
    anchor: a.reminderAnchor,
    days: a.reminderDays,
    time: a.reminderTime,
    dueAt: a.dueAt,
    nextSessionStartsAt,
    now,
  });
}

/**
 * `remindAt` for an assignment as it is about to be stored: null when it is off
 * or has nothing ahead to anchor to; unchanged once it has been sent.
 */
export async function resolveRemindAt(a: ReminderSubject, now: Date, client: Client = db): Promise<Date | null> {
  const needsSession = a.reminderEnabled && a.remindedAt === null && a.reminderAnchor === "NEXT_SESSION";
  const next = needsSession ? await nextSessionStart(a.seasonId, a.createdAt, client) : null;
  return remindAtGiven(a, next, now);
}

/**
 * The Details line for a stored assignment (`reminderLine`). Asks the database
 * for the next session only when the line needs it: on, unsent, unscheduled.
 */
export async function describeReminder(a: ReminderSubject): Promise<string | null> {
  let hasAnchor = true;
  if (a.reminderEnabled && a.remindAt === null && a.remindedAt === null) {
    hasAnchor =
      a.reminderAnchor === "DUE_DATE"
        ? a.dueAt !== null
        : (await nextSessionStart(a.seasonId, a.createdAt, db)) !== null;
  }
  const line = { enabled: a.reminderEnabled, anchor: a.reminderAnchor, remindedAt: a.remindedAt, hasAnchor };
  return reminderLine(line, a.remindAt);
}

/**
 * After a session of the season is created, moved or deleted, or the season
 * is copied: re-resolves `remindAt` for its assignments that have not been
 * reminded (a due-date one only changes when it had none, as in a copy). Each
 * row is written only while its settings are still the ones read, so a
 * concurrent edit of the assignment wins. Returns how many moved.
 */
export async function refreshSeasonReminders(seasonId: number, now: Date): Promise<number> {
  const rows = await db.assignment.findMany({
    where: { seasonId, ...liveAssignment, remindedAt: null, reminderEnabled: true },
    select: {
      id: true,
      seasonId: true,
      createdAt: true,
      dueAt: true,
      reminderEnabled: true,
      reminderDays: true,
      reminderAnchor: true,
      reminderTime: true,
      remindAt: true,
      remindedAt: true,
    },
  });
  if (rows.length === 0) return 0;
  // Every session after the earliest publication: each row's anchor is the first after its own.
  const earliest = new Date(Math.min(...rows.map((a) => a.createdAt.getTime())));
  const sessions = await db.session.findMany({
    where: { seasonId, startsAt: { gt: earliest } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  let moved = 0;
  for (const a of rows) {
    const next = sessions.find((s) => s.startsAt > a.createdAt)?.startsAt ?? null;
    const remindAt = remindAtGiven(a, next, now);
    if ((remindAt?.getTime() ?? null) === (a.remindAt?.getTime() ?? null)) continue;
    const { count } = await db.assignment.updateMany({
      where: {
        id: a.id,
        remindedAt: null,
        remindAt: a.remindAt,
        reminderEnabled: true,
        reminderAnchor: a.reminderAnchor,
        dueAt: a.dueAt,
        reminderDays: a.reminderDays,
        reminderTime: a.reminderTime,
      },
      data: { remindAt },
    });
    moved += count;
  }
  return moved;
}

/**
 * The Details tab's "when it goes out" line; null when the reminder is off.
 * `hasAnchor`: the anchor exists (a due date; a session after publication).
 */
export function reminderLine(
  a: { enabled: boolean; anchor: ReminderAnchor; remindedAt: Date | null; hasAnchor: boolean },
  remindAt: Date | null,
): string | null {
  if (!a.enabled) return null;
  const when = (at: Date) => `${formatShortDayInOrgTime(at)}, around ${formatClockInOrgTime(at)}`;
  if (a.remindedAt !== null) return `Sent ${when(remindAt ?? a.remindedAt)}`;
  if (remindAt !== null) return `${when(remindAt)} — students who haven't finished`;
  if (a.anchor === "NEXT_SESSION") {
    return a.hasAnchor
      ? "The next session was too close — no reminder"
      : "No session after it was published — no reminder";
  }
  return a.hasAnchor ? "Too close to the due date — no reminder" : "No due date yet — no reminder";
}

/** The reminder's body: "2 parts left before Thursday", the weekday being the anchor's (`days` after it goes out). */
export function reminderBody(partsLeft: number, remindAt: Date, days: number): string {
  const weekday = formatWeekdayInOrgTime(orgDaysBeforeAt(remindAt, -days, "12:00"));
  if (partsLeft === 0) return `Every part is done. Submit it before ${weekday}`;
  return `${partsLeft} ${partsLeft === 1 ? "part" : "parts"} left before ${weekday}`;
}

/** The most assignments one scheduler run claims; the rest go out on the next run. */
const REMINDER_BATCH = 50;

/** Reminds one claimed assignment's students who have not submitted. Returns how many were told. */
async function remindStudents(a: {
  id: number;
  seasonId: number;
  title: string;
  remindAt: Date;
  reminderDays: number;
}) {
  const [roster, submitted] = await Promise.all([
    db.seasonEnrollment.findMany({
      where: { seasonId: a.seasonId, ...seasonRosterMember },
      select: { studentUserId: true },
    }),
    db.submission.findMany({
      where: { assignmentId: a.id, ...SUBMITTED_WHERE },
      select: { studentUserId: true },
    }),
  ]);
  const done = new Set(submitted.map((s) => s.studentUserId));
  const due = roster.map((r) => r.studentUserId).filter((id) => !done.has(id));
  if (due.length === 0) return 0;

  // One notification call per body: students with as many parts left share it.
  const standings = await workStandings(db, a.id, due);
  const byBody = new Map<string, number[]>();
  for (const id of due) {
    const body = reminderBody(standings.get(id)?.partsLeft ?? 0, a.remindAt, a.reminderDays);
    byBody.set(body, [...(byBody.get(body) ?? []), id]);
  }
  for (const [body, ids] of byBody) {
    await createNotificationsBulk(ids, {
      type: "ASSIGNMENT_REMINDER",
      title: `Reminder: ${a.title}`,
      body,
      link: notificationLink.studentAssignment(a.id),
    });
  }
  return due.length;
}

/**
 * The `assignment-reminders` handler: each live assignment of an ACTIVE season
 * whose reminder is due is claimed (`remindedAt = now` where it is still null)
 * before anything is sent, so two overlapping runs never both send it and a run
 * that dies halfway never sends twice. Returns how many students were told.
 */
export async function sendDueAssignmentReminders(now: Date = new Date()): Promise<number> {
  const due = await db.assignment.findMany({
    where: {
      ...liveAssignment,
      reminderEnabled: true,
      remindedAt: null,
      remindAt: { lte: now },
      season: { ...liveSeason, status: "ACTIVE" },
    },
    orderBy: { id: "asc" },
    take: REMINDER_BATCH,
    select: { id: true, seasonId: true, title: true, remindAt: true, reminderDays: true },
  });
  let sent = 0;
  for (const a of due) {
    if (a.remindAt === null) continue;
    const claimed = await db.assignment.updateMany({
      where: { id: a.id, remindedAt: null },
      data: { remindedAt: now },
    });
    if (claimed.count !== 1) continue;
    // Too late: "before Thursday" must not arrive on or after Thursday (the
    // season was a draft, or no request came for days). Claimed, not sent.
    if (isLate(a.remindAt, a.reminderDays, now)) continue;
    try {
      sent += await remindStudents({ ...a, remindAt: a.remindAt });
    } catch (err) {
      // One assignment's failure never stops the rest. Its id only, no names.
      console.error(`[assignment-reminders] assignment ${a.id} failed:`, err instanceof Error ? err.message : err);
      reportError(err, { scheduler: "assignment-reminders", assignmentId: String(a.id) });
    }
  }
  return sent;
}

/** Whether the org clock has reached the anchor's day: the reminder's "before <day>" no longer holds. */
export function isLate(remindAt: Date, days: number, now: Date): boolean {
  return orgDayKey(now) >= orgDayKey(orgDaysBeforeAt(remindAt, -days, "12:00"));
}
