import { db } from "../../db/client";
import { lockAttempt, markAndClose, type LockedAttempt } from "./mark-and-close";
import { notifyQuizGraded } from "./notify";
import { isExpired, SAVE_GRACE_MS } from "./timing";

/*
 * Closing an attempt the student didn't submit (spec "Timing"): its time ran
 * out, staff ended it, or the third exit ended it. It is marked like a submit,
 * with what is saved and without the completeness rule. A dead phone never
 * leaves an attempt open: every read of an expired attempt, the student's or
 * staff's, closes it first.
 */

type CloseReason = "TIMED_OUT" | "ENDED_BY_STAFF" | "ENDED_BY_EXITS";

/** Close under the row lock when the attempt is still open and `due` holds for its locked state. */
async function closeLocked(
  attemptId: number,
  endReason: CloseReason,
  endedById: number | null,
  due: (row: LockedAttempt) => boolean,
): Promise<boolean> {
  const outcome = await db.$transaction(async (tx) => {
    const row = await lockAttempt(tx, attemptId);
    if (row?.status !== "IN_PROGRESS" || !due(row)) return null;
    const { graded } = await markAndClose(tx, row.quizId, attemptId, { requireComplete: false, endReason, endedById });
    return { graded, quizId: row.quizId, studentUserId: row.studentUserId };
  });
  if (!outcome) return false;
  if (outcome.graded) {
    // After the commit, best-effort (spec D6), as a submit that grades at once does.
    const quiz = await db.quiz.findUnique({ where: { id: outcome.quizId }, select: { title: true } });
    if (quiz) await notifyQuizGraded([outcome.studentUserId], quiz.title);
  }
  return true;
}

/** Close an open attempt now. `closed: false` when it was no longer IN_PROGRESS (someone closed it first). */
export async function closeAttempt(
  attemptId: number,
  endReason: CloseReason,
  endedById: number | null,
): Promise<{ closed: boolean }> {
  return { closed: await closeLocked(attemptId, endReason, endedById, () => true) };
}

/** Close the attempt TIMED_OUT if it is open and past its deadline by more than `graceMs`. */
export async function closeIfExpired(attemptId: number, now = new Date(), graceMs = 0): Promise<boolean> {
  return closeLocked(attemptId, "TIMED_OUT", null, (row) => isExpired(row.deadlineAt, now, graceMs));
}

/**
 * The student's latest attempt at this quiz, closed if it has expired: what each
 * student route does first. Reads pass grace 0; saves and submits pass
 * SAVE_GRACE_MS, so one in flight at the deadline still lands.
 */
export async function closeLatestIfExpired(
  quizId: number,
  studentUserId: number,
  graceMs: number,
  now = new Date(),
): Promise<boolean> {
  const latest = await db.quizAttempt.findFirst({
    where: { quizId, studentUserId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true, status: true, deadlineAt: true },
  });
  // A fast check before taking the lock; closeIfExpired re-checks under it.
  if (latest?.status !== "IN_PROGRESS" || !isExpired(latest.deadlineAt, now, graceMs)) return false;
  return closeIfExpired(latest.id, now, graceMs);
}

/**
 * Every open attempt of the quiz past its deadline (+ grace), closed: what a
 * staff read of the attempts does first. Staff reads give the student the save
 * grace, so watching the list never cuts off a save in flight.
 */
export async function closeExpiredForQuiz(quizId: number, now = new Date(), graceMs = SAVE_GRACE_MS): Promise<number> {
  const expired = await db.quizAttempt.findMany({
    where: { quizId, status: "IN_PROGRESS", deadlineAt: { lt: new Date(now.getTime() - graceMs) } },
    select: { id: true },
  });
  let closed = 0;
  for (const a of expired) if (await closeIfExpired(a.id, now, graceMs)) closed += 1;
  return closed;
}
