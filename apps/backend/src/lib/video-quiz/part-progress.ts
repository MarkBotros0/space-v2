import { isWatched, type PartWork } from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { liveAssignment } from "../db/live";
import { newPublicId } from "../public-id";
import { lockAssignmentForWork, lockOwnSubmission } from "../assignments/essay";
import { applyWatchReport } from "./part-watching";

type Tx = Prisma.TransactionClient;
type Interval = [number, number];

/** A part's video work after a write: the shared PartWork video, plus the resume point and when it was done. */
type PartVideoProgress = NonNullable<PartWork["video"]> & { furthestSeconds: number; completedAt: Date | null };

const partGone = () => new ApiError("not_found", "Part not found.", 404);

/**
 * Locks one student's work on one video part for a write, making it if it is
 * missing, in the per-student lock order (lib/assignments/essay.ts). The
 * assignment's row FOR SHARE first, which pairs with `replaceAssignment`'s FOR
 * UPDATE: an edit that resets or removes this part waits for the write, or the
 * write sees the part gone. Then the Submission (one per assignment per
 * student), made if missing and locked FOR UPDATE, so this write and a Submit
 * or an essay write run one after the other; then the work row, made if
 * missing (its part is always the submission's assignment's, its student the
 * submission's) and locked FOR UPDATE, so two reports landing together merge
 * rather than one losing the other's intervals.
 */
async function lockVideoWork(tx: Tx, partId: number, studentUserId: number) {
  const owner = await tx.assignmentPart.findUnique({ where: { id: partId }, select: { assignmentId: true } });
  if (!owner) throw partGone();
  const { assignmentId } = owner;
  await lockAssignmentForWork(tx, assignmentId);
  // Re-read under the lock: an edit that landed first wins.
  const part = await tx.assignmentPart.findFirst({
    where: { id: partId, kind: "VIDEO", assignment: liveAssignment },
    select: { durationSeconds: true, blockSkipping: true, _count: { select: { videoQuestions: true } } },
  });
  if (!part) throw partGone();

  const submission = await lockOwnSubmission(tx, assignmentId, studentUserId);
  await tx.assignmentPartWork.createMany({
    data: [{ publicId: newPublicId(), partId, submissionId: submission.id, studentUserId }],
    skipDuplicates: true,
  });
  await tx.$queryRaw`SELECT "id" FROM "AssignmentPartWork" WHERE "partId" = ${partId} AND "studentUserId" = ${studentUserId} FOR UPDATE`;
  const work = await tx.assignmentPartWork.findUniqueOrThrow({
    where: { partId_studentUserId: { partId, studentUserId } },
    select: {
      id: true,
      watchedIntervals: true,
      watchedSeconds: true,
      furthestSeconds: true,
      lastReportAt: true,
      doneAt: true,
    },
  });
  return {
    work,
    durationSeconds: part.durationSeconds ?? 0,
    blockSkipping: part.blockSkipping,
    questionCount: part._count.videoQuestions,
  };
}

type Locked = Awaited<ReturnType<typeof lockVideoWork>>;

async function answerTally(tx: Tx, partId: number, studentUserId: number) {
  const rows = await tx.sessionVideoQuestionResponse.findMany({
    where: { studentUserId, question: { assignmentPartId: partId } },
    select: { isCorrect: true },
  });
  return { answered: rows.length, correct: rows.filter((r) => r.isCorrect).length };
}

/**
 * Writes the watching and stamps `doneAt` the first time the part counts as
 * done: watched (90%) and every timed question answered. Once stamped it stays
 * until the video is reset.
 */
async function finish(
  tx: Tx,
  partId: number,
  studentUserId: number,
  locked: Locked,
  watch: { intervals: Interval[]; watchedSeconds: number; furthestSeconds: number; lastReportAt: Date | null },
  now: Date,
): Promise<PartVideoProgress> {
  const tally = await answerTally(tx, partId, studentUserId);
  const done = isWatched(watch.watchedSeconds, locked.durationSeconds) && tally.answered >= locked.questionCount;
  const doneAt = locked.work.doneAt ?? (done ? now : null);
  await tx.assignmentPartWork.update({
    where: { id: locked.work.id },
    data: {
      watchedIntervals: watch.intervals,
      watchedSeconds: watch.watchedSeconds,
      furthestSeconds: watch.furthestSeconds,
      lastReportAt: watch.lastReportAt,
      doneAt,
    },
  });
  return {
    watchedSeconds: watch.watchedSeconds,
    durationSeconds: locked.durationSeconds,
    answered: tally.answered,
    questionCount: locked.questionCount,
    correct: tally.correct,
    furthestSeconds: watch.furthestSeconds,
    completedAt: doneAt,
  };
}

function storedWatch(work: Locked["work"]) {
  return {
    intervals: work.watchedIntervals as Interval[],
    watchedSeconds: work.watchedSeconds,
    furthestSeconds: work.furthestSeconds,
    lastReportAt: work.lastReportAt,
  };
}

/**
 * PUT /assignments/:id/parts/:partId/video/progress: merges a report of what
 * played into the student's watching (`applyWatchReport` holds the rules).
 */
export async function saveVideoPartProgress(
  partId: number,
  studentUserId: number,
  intervals: Interval[],
  position: number,
  now: Date,
): Promise<PartVideoProgress> {
  return db.$transaction(async (tx) => {
    const locked = await lockVideoWork(tx, partId, studentUserId);
    const watch = applyWatchReport(storedWatch(locked.work), { intervals, position }, locked, now);
    return finish(tx, partId, studentUserId, locked, watch, now);
  });
}

/**
 * Records a student's one answer to a video part's question, under the same
 * locks as a progress report, and stamps the part done when this answer was the
 * last thing missing. A second answer fails on the unique index, as on a
 * session (the caller replays the recorded verdict).
 */
export async function recordPartAnswer(input: {
  partId: number;
  studentUserId: number;
  questionId: number;
  selectedIndex: number;
  isCorrect: boolean;
}): Promise<{ furthestSeconds: number; completedAt: Date | null }> {
  const { partId, studentUserId } = input;
  return db.$transaction(async (tx) => {
    const locked = await lockVideoWork(tx, partId, studentUserId);
    await tx.sessionVideoQuestionResponse.create({
      data: {
        questionId: input.questionId,
        studentUserId,
        selectedIndex: input.selectedIndex,
        isCorrect: input.isCorrect,
      },
    });
    const progress = await finish(tx, partId, studentUserId, locked, storedWatch(locked.work), new Date());
    return { furthestSeconds: progress.furthestSeconds, completedAt: progress.completedAt };
  });
}
