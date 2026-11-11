import { db } from "../db/client";
import { FOLLOW_UP_DAYS, type FollowUp } from "../../../../packages/shared/src/index";
import { createNotificationsBulk } from "./notifications";
import { MS_PER_DAY, orgDayKey, orgWallClockToInstant, orgWallTime } from "./org-time";
import { notificationLink } from "./notification-target";
import { liveUser } from "./db/live";

/** How long a done follow-up stays on the list. */
const DONE_SHOWN_DAYS = 30;

function dueAtFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + FOLLOW_UP_DAYS * MS_PER_DAY);
}

const SELECT = {
  id: true,
  studentUserId: true,
  studentUser: { select: { name: true } },
  reason: true,
  createdAt: true,
  dueAt: true,
  remindedAt: true,
  doneAt: true,
} as const;

type Row = {
  id: number;
  studentUserId: number;
  studentUser: { name: string };
  reason: string | null;
  createdAt: Date;
  dueAt: Date;
  remindedAt: Date | null;
  doneAt: Date | null;
};

export function toFollowUp(row: Row): FollowUp {
  return {
    id: row.id,
    studentUserId: row.studentUserId,
    studentName: row.studentUser.name,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    remindedAt: row.remindedAt?.toISOString() ?? null,
    doneAt: row.doneAt?.toISOString() ?? null,
  };
}

/** One mentor's follow-ups: open by due date, then the recently done, newest first. */
export async function listFollowUps(mentorUserId: number, now = new Date()): Promise<FollowUp[]> {
  const live = { mentorUserId, studentUser: liveUser };
  const [open, done] = await Promise.all([
    db.mentorFollowUp.findMany({
      where: { ...live, doneAt: null },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      select: SELECT,
    }),
    db.mentorFollowUp.findMany({
      where: { ...live, doneAt: { gte: new Date(now.getTime() - DONE_SHOWN_DAYS * MS_PER_DAY) } },
      orderBy: [{ doneAt: "desc" }, { id: "desc" }],
      select: SELECT,
    }),
  ]);
  return [...open, ...done].map(toFollowUp);
}

export function countDueFollowUps(mentorUserId: number, now = new Date()): Promise<number> {
  return db.mentorFollowUp.count({
    where: { mentorUserId, doneAt: null, dueAt: { lte: now }, studentUser: liveUser },
  });
}

export async function createFollowUp(mentorUserId: number, studentUserId: number, reason: string | null) {
  const createdAt = new Date();
  const row = await db.mentorFollowUp.create({
    data: { mentorUserId, studentUserId, reason, createdAt, dueAt: dueAtFor(createdAt) },
    select: SELECT,
  });
  return toFollowUp(row);
}

/** The org-clock time of day a due follow-up is reminded. */
export const REMINDER_HOUR = "09:00";

/**
 * Follow-ups with `dueAt <= followUpCutoff(now)` are due. From 9:00 org time it
 * is `now`; before that, the start of the org day, so one due today waits for
 * 9:00 while an earlier-day one goes at once.
 */
export function followUpCutoff(now: Date): Date {
  return orgWallTime(now) >= REMINDER_HOUR ? now : orgWallClockToInstant(orgDayKey(now), "00:00");
}

/** The most reminders one scheduler run claims; the rest go out on the next run. */
const REMINDER_BATCH = 200;

/**
 * The follow-up reminder: one MENTOR_FOLLOWUP to the mentor who made each open
 * follow-up past its due date, never twice. Each row is claimed by stamping
 * `remindedAt` where it is still null, so two overlapping runs cannot both send
 * it. A mentor who is no longer a live MENTOR, or a deleted student, is skipped.
 * Returns how many reminders went out.
 */
export async function sendDueFollowUpReminders(now: Date = new Date()): Promise<number> {
  const due = await db.mentorFollowUp.findMany({
    where: {
      doneAt: null,
      remindedAt: null,
      dueAt: { lte: followUpCutoff(now) },
      mentorUser: { role: "MENTOR", ...liveUser },
      studentUser: liveUser,
    },
    orderBy: { id: "asc" },
    take: REMINDER_BATCH,
    select: {
      id: true,
      mentorUserId: true,
      studentUserId: true,
      reason: true,
      studentUser: { select: { name: true } },
    },
  });
  let sent = 0;
  for (const f of due) {
    const claimed = await db.mentorFollowUp.updateMany({
      where: { id: f.id, remindedAt: null, doneAt: null },
      data: { remindedAt: now },
    });
    if (claimed.count !== 1) continue;
    await createNotificationsBulk([f.mentorUserId], {
      type: "MENTOR_FOLLOWUP",
      title: `Follow up with ${f.studentUser.name}`,
      body: f.reason ?? `You said you'd come back to them ${FOLLOW_UP_DAYS} days ago.`,
      link: notificationLink.adminStudent(f.studentUserId),
    });
    sent += 1;
  }
  return sent;
}
