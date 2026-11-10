import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { isWatched } from "../../../../../packages/shared/src/index";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { assertInsideVideo, createQuestionFor, deleteQuestionIn } from "../video-quiz/questions";
import { settleSubmitted } from "./standing";

/*
 * A video part's timed questions (ruling I1). A video is done when it is
 * watched and every question on it is answered, so adding or deleting one
 * changes who is done. Each write holds the Assignment FOR UPDATE, as a part
 * edit does (`replaceAssignment`), then the Submissions and the part's work
 * rows, so no student's write lands between the change and the settling. No
 * confirmation is asked: the question editor says inline what happens.
 */

type Tx = Prisma.TransactionClient;
type QuestionInput = { atSeconds: number; prompt: string; options: string[]; correctIndex: number; points: number };

const partGone = () => new ApiError("not_found", "Part not found.", 404);

/** Locks the part's assignment FOR UPDATE and re-reads the part under it. */
async function lockVideoPart(tx: Tx, partId: number) {
  const owner = await tx.assignmentPart.findUnique({ where: { id: partId }, select: { assignmentId: true } });
  if (!owner) throw partGone();
  await tx.$queryRaw`SELECT "id" FROM "Assignment" WHERE "id" = ${owner.assignmentId} FOR UPDATE`;
  const part = await tx.assignmentPart.findFirst({
    where: { id: partId, kind: "VIDEO", assignment: liveAssignment },
    select: { assignmentId: true, durationSeconds: true },
  });
  if (!part) throw partGone();
  await tx.$queryRaw`SELECT "id" FROM "Submission" WHERE "assignmentId" = ${part.assignmentId} ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "AssignmentPartWork" WHERE "partId" = ${partId} ORDER BY "id" FOR UPDATE`;
  return part;
}

/**
 * Recomputes `doneAt` on the part's work rows against its questions now: a
 * row that is no longer done is cleared, one that now is gets stamped (a row
 * already stamped keeps its time).
 */
async function refreshDoneAt(tx: Tx, partId: number, durationSeconds: number | null, now: Date) {
  const [works, questionCount, responses] = await Promise.all([
    tx.assignmentPartWork.findMany({
      where: { partId },
      select: { id: true, studentUserId: true, watchedSeconds: true, doneAt: true },
    }),
    tx.sessionVideoQuestion.count({ where: { assignmentPartId: partId } }),
    tx.sessionVideoQuestionResponse.findMany({
      where: { question: { assignmentPartId: partId } },
      select: { studentUserId: true },
    }),
  ]);
  const answered = new Map<number, number>();
  for (const r of responses) answered.set(r.studentUserId, (answered.get(r.studentUserId) ?? 0) + 1);
  const stamp: number[] = [];
  const clear: number[] = [];
  for (const w of works) {
    const done =
      isWatched(w.watchedSeconds, durationSeconds ?? 0) && (answered.get(w.studentUserId) ?? 0) >= questionCount;
    if (done && w.doneAt === null) stamp.push(w.id);
    if (!done && w.doneAt !== null) clear.push(w.id);
  }
  if (stamp.length > 0) await tx.assignmentPartWork.updateMany({ where: { id: { in: stamp } }, data: { doneAt: now } });
  if (clear.length > 0)
    await tx.assignmentPartWork.updateMany({ where: { id: { in: clear } }, data: { doneAt: null } });
}

async function settlePart(tx: Tx, part: { assignmentId: number; durationSeconds: number | null }, partId: number) {
  const now = new Date();
  await refreshDoneAt(tx, partId, part.durationSeconds, now);
  // Reopens a submitted student now short of the video; completes one it finishes.
  await settleSubmitted(tx, part.assignmentId, now);
}

/** POST /assignments/:id/parts/:partId/video-questions' write. */
export async function addPartQuestion(partId: number, body: QuestionInput, createdById: number) {
  return db.$transaction(async (tx) => {
    const part = await lockVideoPart(tx, partId);
    assertInsideVideo(body.atSeconds, part.durationSeconds);
    const question = await createQuestionFor({ partId }, body, createdById, tx);
    await settlePart(tx, part, partId);
    return question;
  });
}

/** DELETE /video-questions/:questionId's write for a video part's question. Returns the answers removed. */
export async function deletePartQuestion(questionId: number, partId: number): Promise<number> {
  return db.$transaction(async (tx) => {
    const part = await lockVideoPart(tx, partId);
    const still = await tx.sessionVideoQuestion.findFirst({
      where: { id: questionId, assignmentPartId: partId },
      select: { id: true },
    });
    if (!still) throw new ApiError("not_found", "Question not found.", 404);
    const responsesRemoved = await deleteQuestionIn(tx, questionId);
    await settlePart(tx, part, partId);
    return responsesRemoved;
  });
}
