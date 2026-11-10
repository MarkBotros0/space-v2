import { db } from "../../db/client";
import { refreshSeasonReminders } from "../assignments/reminder";
import { bestEffort } from "../best-effort";

/**
 * After a write moves the season's sessions: assignments reminded before "the
 * next session" follow it (lib/assignments/reminder.ts). Runs after the commit
 * and never fails the session write; a reminder left stale is re-resolved the
 * next time a session or the assignment is saved.
 */
function followNextSession(seasonId: number): Promise<void> {
  return bestEffort("assignment-reminders:refresh", () => refreshSeasonReminders(seasonId, new Date()));
}

type SessionFields = {
  title: string;
  durationMinutes: number;
  location: string | null;
  youtubeUrl: string | null;
  description: string | null;
};

/** Creates one session per start time, all or none. Returns the new ids in the same order. */
export async function createSessionSeries(
  dates: Date[],
  fields: SessionFields & { seasonId: number },
  recurrenceGroupId: string | null,
): Promise<{ id: number }[]> {
  const created = await db.$transaction(
    dates.map((startsAt) =>
      db.session.create({
        data: { ...fields, startsAt, recurrenceGroupId },
        select: { id: true },
      }),
    ),
  );
  await followNextSession(fields.seasonId);
  return created;
}

/**
 * Edits the target sessions, all or none. scope "one": the anchor gets the new
 * start (t.startsAt + delta). Series: every sibling shifts by the same delta
 * (v1's semantics, spec 03 item 3's anchoring quirk and all). A fixed delta
 * preserves the siblings' existing org-time spacing.
 */
export async function editSessions(
  seasonId: number,
  targets: { id: number; startsAt: Date }[],
  fields: SessionFields,
  delta: number,
): Promise<void> {
  await db.$transaction(
    targets.map((t) =>
      db.session.update({
        where: { id: t.id },
        data: { ...fields, startsAt: new Date(t.startsAt.getTime() + delta) },
      }),
    ),
  );
  if (delta !== 0) await followNextSession(seasonId);
}

/**
 * Deletes the target sessions with their attendance and video progress, all or
 * none. Explicit deletes (the FKs cascade anyway) so the transaction states what
 * it destroys. Video questions cascade; assignments/quizzes keep their rows with
 * sessionId set null. Returns how many sessions went.
 */
export async function deleteSessionsWithRecords(seasonId: number, targetIds: number[]): Promise<{ count: number }> {
  const inTargets = { sessionId: { in: targetIds } };
  const [, , removed] = await db.$transaction([
    db.attendance.deleteMany({ where: inTargets }),
    db.sessionVideoProgress.deleteMany({ where: inTargets }),
    db.session.deleteMany({ where: { id: { in: targetIds } } }),
  ]);
  await followNextSession(seasonId);
  return removed;
}
