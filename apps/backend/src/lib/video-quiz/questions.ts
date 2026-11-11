import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { ownerColumns, questionsOf, type VideoOwner } from "./owner";

/** The staff view of a video question, with how many students answered it. */
const ADMIN_SELECT = {
  id: true,
  atSeconds: true,
  prompt: true,
  options: true,
  correctIndex: true,
  points: true,
  _count: { select: { responses: true } },
} as const;

type Client = Prisma.TransactionClient | typeof db;

type QuestionInput = { atSeconds: number; prompt: string; options: string[]; correctIndex: number; points: number };

/** A part's question must come before its video ends; a session's length isn't stored (null). */
export function assertInsideVideo(atSeconds: number, durationSeconds: number | null): void {
  if (durationSeconds !== null && atSeconds >= durationSeconds) {
    throw new ApiError("bad_request", "That time is past the end of the video.", 400);
  }
}

type AdminRowSource = Prisma.SessionVideoQuestionGetPayload<{ select: typeof ADMIN_SELECT }>;

/** The admin row shape — the only place `correctIndex` may be sent. */
export function toAdminRow(q: AdminRowSource) {
  return {
    id: q.id,
    atSeconds: q.atSeconds,
    prompt: q.prompt,
    options: q.options,
    correctIndex: q.correctIndex,
    points: q.points,
    responseCount: q._count.responses,
  };
}

/** An owner's questions for the authoring screen, in play order. Carries the answer key: staff only. */
export async function listQuestionsFor(owner: VideoOwner) {
  const rows = await db.sessionVideoQuestion.findMany({
    where: questionsOf(owner),
    orderBy: [{ atSeconds: "asc" }, { id: "asc" }],
    select: ADMIN_SELECT,
  });
  return rows.map(toAdminRow);
}

/**
 * Adds a question to a session's video or a video part. createdById is stamped
 * on create only — there is no updatedById column, so it means "who first
 * authored this". A video part's question is written inside the transaction
 * that settles its students (lib/assignments/part-questions.ts).
 */
export async function createQuestionFor(
  owner: VideoOwner,
  body: QuestionInput,
  createdById: number,
  client: Client = db,
) {
  const created = await client.sessionVideoQuestion.create({
    data: {
      ...ownerColumns(owner),
      atSeconds: body.atSeconds,
      prompt: body.prompt,
      options: body.options,
      correctIndex: body.correctIndex,
      points: body.points,
      createdById,
    },
    select: ADMIN_SELECT,
  });
  return toAdminRow(created);
}

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
 * Deletes a video question inside the caller's transaction; the database
 * cascade removes the responses. Returns how many there were.
 */
export async function deleteQuestionIn(tx: Prisma.TransactionClient, questionId: number): Promise<number> {
  const count = await tx.sessionVideoQuestionResponse.count({ where: { questionId } });
  await tx.sessionVideoQuestion.delete({ where: { id: questionId } });
  return count;
}

/**
 * Deletes a session's video question; the database cascade removes the
 * responses. The count is returned so the client can warn before and confirm
 * after. SessionVideoProgress is deliberately left alone (v1 R11).
 */
export async function deleteQuestionCountingResponses(questionId: number): Promise<number> {
  return db.$transaction((tx) => deleteQuestionIn(tx, questionId));
}
