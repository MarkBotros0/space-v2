import { db } from "../../db/client";

type Progress = { furthestSeconds: number; completedAt: Date | null };

/**
 * Records a student's first and only answer to a video question and moves
 * their progress forward, in one transaction (refactor BE-004). A second answer
 * to the same question fails on the unique index (questionId, studentUserId) —
 * that index IS the "one answer, no retries" rule — and the caller answers the
 * race loser with the answer already recorded (spec 13 §10 D14).
 */
export async function recordVideoAnswer(input: {
  sessionId: number;
  studentUserId: number;
  question: { id: number; atSeconds: number };
  selectedIndex: number;
  isCorrect: boolean;
  isLast: boolean;
}): Promise<Progress> {
  const { sessionId, studentUserId, question, isLast } = input;
  return db.$transaction(async (tx) => {
    await tx.sessionVideoQuestionResponse.create({
      data: { questionId: question.id, studentUserId, selectedIndex: input.selectedIndex, isCorrect: input.isCorrect },
    });
    const current = await tx.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { furthestSeconds: true, completedAt: true },
    });
    // Math.max, never `{ set: ... }`. v1 wrote the question's atSeconds
    // absolutely (spec 13 R57), twenty lines above a comment promising
    // furthestSeconds "only ever moves forward" — unreachable through its own
    // UI because the barrier forced ascending order, trivially reachable
    // through an API.
    const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, question.atSeconds);
    // Completion is derived here and asserted nowhere (spec 13 D3).
    const completedAt = current?.completedAt ?? (isLast ? new Date() : null);
    return tx.sessionVideoProgress.upsert({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      create: { sessionId, studentUserId, furthestSeconds, completedAt },
      update: { furthestSeconds, completedAt },
      select: { furthestSeconds: true, completedAt: true },
    });
  });
}

/**
 * Saves how far a student has watched: idempotent and monotone. Read-then-write
 * inside a transaction, because v1 did it outside one and two concurrent saves
 * (visibilitychange and unmount fire together) could persist the lower value
 * (spec 13 R64). completedAt is never set or cleared here: the answer path
 * derives it (spec 13 D3).
 */
export async function saveVideoProgressSeconds(
  sessionId: number,
  studentUserId: number,
  seconds: number,
): Promise<Progress> {
  return db.$transaction(async (tx) => {
    const current = await tx.sessionVideoProgress.findUnique({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      select: { furthestSeconds: true, completedAt: true },
    });
    const furthestSeconds = Math.max(current?.furthestSeconds ?? 0, seconds);
    return tx.sessionVideoProgress.upsert({
      where: { sessionId_studentUserId: { sessionId, studentUserId } },
      create: { sessionId, studentUserId, furthestSeconds },
      update: { furthestSeconds },
      select: { furthestSeconds: true, completedAt: true },
    });
  });
}
