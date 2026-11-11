import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { MAX_EXITS, type QuizAttemptEventInput } from "../../../../../packages/shared/src/index";
import { closeLockedInTx, notifyClosed, type ClosedAttempt } from "./close-attempt";
import { lockAttempt } from "./mark-and-close";
import { isExpired, SAVE_GRACE_MS } from "./timing";

/*
 * The phone's exit reports (spec "Integrity" → "Leaving the quiz"). The server's
 * count is the truth: EXIT and RELAUNCH rows count, SCREENSHOT is logged only,
 * and the report that brings the count to MAX_EXITS ends the attempt
 * ENDED_BY_EXITS in the same transaction, under the attempt row lock, so two
 * reports racing can't both close it and a save can't land between the count
 * and the close. `(attemptId, clientEventId)` is unique: a retry or an offline
 * replay is stored, and counted, once.
 */

const COUNTED = ["EXIT", "RELAUNCH"] as const;

const exitCount = (tx: Prisma.TransactionClient, attemptId: number) =>
  tx.quizAttemptEvent.count({ where: { attemptId, kind: { in: [...COUNTED] } } });

type Recorded = { exits: number; ended: boolean; closed: ClosedAttempt | null };

async function recordLocked(
  tx: Prisma.TransactionClient,
  attemptId: number,
  events: QuizAttemptEventInput[],
  now: Date,
): Promise<Recorded> {
  const row = await lockAttempt(tx, attemptId);
  if (row?.status !== "IN_PROGRESS") return { exits: await exitCount(tx, attemptId), ended: false, closed: null };

  // Past the deadline (+ the save grace): the time ran out before this report, so the
  // attempt closes TIMED_OUT and the report is ignored like any on a closed attempt.
  if (isExpired(row.deadlineAt, now, SAVE_GRACE_MS)) {
    const closed = await closeLockedInTx(tx, attemptId, row, "TIMED_OUT", null);
    return { exits: await exitCount(tx, attemptId), ended: false, closed };
  }

  // A timed attempt whose clock hasn't started (a reopened one before the student's
  // start PUT) shows no questions, so leaving it is not an exit. Untimed counts from the start.
  const quiz = await tx.quiz.findUniqueOrThrow({ where: { id: row.quizId }, select: { timeLimitMinutes: true } });
  if (quiz.timeLimitMinutes !== null && row.deadlineAt === null) {
    return { exits: await exitCount(tx, attemptId), ended: false, closed: null };
  }

  // An event from before this attempt existed was queued for an earlier one (a replay
  // landing on a retake): it is not this attempt's, so it is dropped, not stored or counted.
  const { createdAt } = await tx.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { createdAt: true },
  });
  const own = events.filter((e) => Date.parse(e.leftAt) >= createdAt.getTime());

  await tx.quizAttemptEvent.createMany({
    data: own.map((e) => ({
      attemptId,
      clientEventId: e.clientEventId,
      kind: e.kind,
      leftAt: new Date(e.leftAt),
      returnedAt: e.returnedAt === null ? null : new Date(e.returnedAt),
    })),
    skipDuplicates: true,
  });
  const exits = await exitCount(tx, attemptId);
  if (exits < MAX_EXITS) return { exits, ended: false, closed: null };
  const closed = await closeLockedInTx(tx, attemptId, row, "ENDED_BY_EXITS", null);
  return { exits, ended: true, closed };
}

/**
 * Store the phone's events for an attempt and count its exits. On an attempt that
 * isn't IN_PROGRESS nothing is stored and `ended` is false (Review Focus 5: an exit
 * after the deadline closed it is no error and no second close). `ended` is true only
 * when this report closed it. "Your score is in" goes after the commit, once, and only
 * when the close left the attempt GRADED.
 */
export async function recordAttemptEvents(
  attemptId: number,
  events: QuizAttemptEventInput[],
  now = new Date(),
): Promise<{ exits: number; ended: boolean }> {
  const { exits, ended, closed } = await db.$transaction((tx) => recordLocked(tx, attemptId, events, now));
  await notifyClosed(closed);
  return { exits, ended };
}
