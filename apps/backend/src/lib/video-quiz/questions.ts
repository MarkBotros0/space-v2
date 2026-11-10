import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";

/** The staff view of a video question, with how many students answered it. */
export const ADMIN_SELECT = {
  id: true,
  atSeconds: true,
  prompt: true,
  options: true,
  correctIndex: true,
  points: true,
  _count: { select: { responses: true } },
} as const;

type QuestionInput = { atSeconds: number; prompt: string; options: string[]; correctIndex: number; points: number };

/** Re-marks every recorded answer against the new key. Returns how many verdicts changed. */
async function regradeResponses(
  tx: Prisma.TransactionClient,
  questionId: number,
  body: QuestionInput,
): Promise<number> {
  const responses = await tx.sessionVideoQuestionResponse.findMany({
    where: { questionId },
    select: { id: true, selectedIndex: true, isCorrect: true },
  });
  let regraded = 0;
  for (const r of responses) {
    // An index the shrunken options no longer contain can never be right.
    const nowCorrect = r.selectedIndex < body.options.length && r.selectedIndex === body.correctIndex;
    if (nowCorrect === r.isCorrect) continue;
    await tx.sessionVideoQuestionResponse.update({ where: { id: r.id }, data: { isCorrect: nowCorrect } });
    regraded += 1;
  }
  return regraded;
}

/**
 * Edits a video question and, when its answer key changed, re-grades in the
 * same transaction (spec 13 §10 D5). v1 changed the key and left every
 * recorded verdict frozen at its old value, so a corrected answer key left
 * every prior grade wrong, and shrinking the options could strand a
 * selectedIndex now out of range (R8/R9).
 */
export async function updateAndRegrade(questionId: number, body: QuestionInput, keyChanged: boolean) {
  return db.$transaction(async (tx) => {
    const updated = await tx.sessionVideoQuestion.update({
      where: { id: questionId },
      data: {
        atSeconds: body.atSeconds,
        prompt: body.prompt,
        options: body.options,
        correctIndex: body.correctIndex,
        points: body.points,
      },
      select: ADMIN_SELECT,
    });
    const regradedCount = keyChanged ? await regradeResponses(tx, questionId, body) : 0;
    return { question: updated, regradedCount };
  });
}

/**
 * Deletes a video question; the database cascade removes the responses. The
 * count is returned so the client can warn before and confirm after.
 * SessionVideoProgress is deliberately left alone (v1 R11).
 */
export async function deleteQuestionCountingResponses(questionId: number): Promise<number> {
  return db.$transaction(async (tx) => {
    const count = await tx.sessionVideoQuestionResponse.count({ where: { questionId } });
    await tx.sessionVideoQuestion.delete({ where: { id: questionId } });
    return count;
  });
}
