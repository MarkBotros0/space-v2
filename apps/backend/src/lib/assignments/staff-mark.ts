import { db } from "../../db/client";
import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api-error";
import { liveAssignment, liveUser } from "../db/live";
import { lockSeason } from "../roles";
import { isSeasonFinished } from "../seasons/status";
import { lockAssignmentForWork, lockOwnSubmission, lockSubmissionForWork } from "./essay";

/** Whose assignment, in which season; the season is passed so it can be locked first. */
export type StaffMarkTarget = { assignmentId: number; seasonId: number; studentUserId: number };

interface StaffMarkResult {
  markedAt: Date;
  /** Null only when the account that made a kept mark is gone. */
  markedBy: { id: number; name: string | null } | null;
}

/**
 * The student's User row FOR SHARE. Seat writes take it FOR UPDATE (`lockPeople`), so a mark can't
 * cross one that takes the student out of the season. Not FOR UPDATE here: the student's own writes
 * hold their Assignment and Submission and then insert rows pointing at their User, whose foreign
 * key check takes FOR KEY SHARE; FOR UPDATE would block that check and deadlock against them.
 */
function shareStudent(tx: Prisma.TransactionClient, studentUserId: number) {
  return tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${studentUserId} FOR SHARE`;
}

/**
 * The locks a mark and an undo both take, in the one order (docs/rules/roles.md): the Season FOR
 * SHARE, so a mark lands wholly before End's check or sees the season finished; the student
 * (`shareStudent`); then the rows: the Assignment, FOR SHARE for a mark (as every write to a
 * student's work), FOR NO KEY UPDATE for an undo, which may delete the Submission: a student's
 * write takes the Assignment FOR SHARE before it finds or makes their Submission, so it waits
 * for the undo and then makes the row again, instead of finding one the undo deletes.
 * Refused on a draft or finished season, for a student who is not an ACTIVE live participant, and
 * for a deleted assignment; each read under the locks.
 */
async function lockForMark(
  tx: Prisma.TransactionClient,
  { assignmentId, seasonId, studentUserId }: StaffMarkTarget,
  assignmentLock: "share" | "update",
) {
  await lockSeason(tx, seasonId, "share");
  const season = await tx.season.findUnique({ where: { id: seasonId }, select: { status: true } });
  if (season?.status === "DRAFT") throw new ApiError("season_draft", "This season hasn't started yet.", 409);
  if (season && isSeasonFinished(season.status)) {
    throw new ApiError("season_finished", "This season has ended; its work can't change.", 409);
  }
  await shareStudent(tx, studentUserId);
  const enrolled = await tx.seasonEnrollment.count({
    where: { seasonId, studentUserId, status: "ACTIVE", studentUser: liveUser },
  });
  if (enrolled === 0) throw new ApiError("not_found", "Student not found in this season.", 404);
  if (assignmentLock === "share") await lockAssignmentForWork(tx, assignmentId);
  else await tx.$queryRaw`SELECT "id" FROM "Assignment" WHERE "id" = ${assignmentId} FOR NO KEY UPDATE`;
  const live = await tx.assignment.count({ where: { id: assignmentId, seasonId, ...liveAssignment } });
  if (live === 0) throw new ApiError("not_found", "Assignment not found.", 404);
}

/**
 * Staff mark the assignment submitted for a student who did it outside the app. The Submission is
 * made if there is none (as Submit makes it), then the mark; a second mark keeps the first, who and
 * when. Nothing else changes: no essay is handed in, nothing reaches the review queue, nobody is
 * told. A later Submit in the app still stands beside the mark.
 */
export async function markSubmitted(target: StaffMarkTarget, byId: number): Promise<StaffMarkResult> {
  const { assignmentId, studentUserId } = target;
  return db.$transaction(async (tx) => {
    await lockForMark(tx, target, "share");
    const submission = await lockOwnSubmission(tx, assignmentId, studentUserId);
    await tx.submissionStaffMark.createMany({
      data: [{ submissionId: submission.id, markedById: byId }],
      skipDuplicates: true,
    });
    return tx.submissionStaffMark.findUniqueOrThrow({
      where: { submissionId: submission.id },
      select: { markedAt: true, markedBy: { select: { id: true, name: true } } },
    });
  });
}

/**
 * Takes the mark away, whoever made it. The Submission goes too when the mark was all it held (no
 * Submit in the app, no work on any part), so an undone mark leaves the student as they were.
 * Nothing to undo is not an error.
 */
export async function undoMarkSubmitted(target: StaffMarkTarget): Promise<void> {
  const { assignmentId, studentUserId } = target;
  await db.$transaction(async (tx) => {
    await lockForMark(tx, target, "update");
    const submission = await tx.submission.findUnique({
      where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
      select: { id: true },
    });
    if (!submission) return;
    await lockSubmissionForWork(tx, submission.id);
    await tx.submissionStaffMark.deleteMany({ where: { submissionId: submission.id } });
    // The emptiness test is in the DELETE's own WHERE, so work written meanwhile keeps the row.
    await tx.submission.deleteMany({ where: { id: submission.id, submittedAt: null, partWork: { none: {} } } });
  });
}
