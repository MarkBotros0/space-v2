/**
 * Assignments as parts, and students' work on them, for the sweep seed. Work is
 * always part work (an AssignmentPartWork under the student's Submission), as the
 * app writes it: a bare Submission row is never made.
 */
import type { SubmissionStatus } from "../../src/generated/prisma/enums";
import { db } from "../../src/db/client";
import { newPublicId } from "../../src/lib/public-id";

/** A one-essay assignment, the shape most seeded work has. Returns it with its essay part's id. */
export async function createEssayAssignment(data: {
  seasonId: number;
  title: string;
  description: string;
  dueAt: Date | null;
  createdById: number;
  prompt: string;
  minWords?: number;
}) {
  const { prompt, minWords, ...rest } = data;
  const assignment = await db.assignment.create({
    data: {
      ...rest,
      // No send time: the sweep backend's scheduler never sends a reminder to a sweep user.
      reminderEnabled: true,
      parts: { create: [{ position: 0, kind: "ESSAY", prompt, minWords: minWords ?? null }] },
    },
    select: { id: true, parts: { select: { id: true } } },
  });
  return { id: assignment.id, essayPartId: assignment.parts[0]!.id };
}

/** The student's Submission for this assignment, made if missing; `submittedAt` set when given. */
async function submissionFor(assignmentId: number, studentUserId: number, submittedAt?: Date, completedAt?: Date) {
  return db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
    create: {
      publicId: newPublicId(),
      assignmentId,
      studentUserId,
      submittedAt: submittedAt ?? null,
      completedAt: completedAt ?? null,
    },
    update: submittedAt ? { submittedAt, completedAt: completedAt ?? null } : {},
    select: { id: true },
  });
}

/** One essay or forum post: text and its review state. Submit is a separate call (`markSubmitted`). */
export async function seedTextWork(w: {
  assignmentId: number;
  partId: number;
  studentUserId: number;
  text: string;
  status: SubmissionStatus;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedById?: number;
  feedback?: string;
}) {
  const submission = await submissionFor(w.assignmentId, w.studentUserId);
  const handedIn = w.status !== "DRAFT";
  return db.assignmentPartWork.create({
    data: {
      publicId: newPublicId(),
      partId: w.partId,
      submissionId: submission.id,
      studentUserId: w.studentUserId,
      text: w.text,
      status: w.status,
      submittedAt: handedIn ? (w.submittedAt ?? new Date()) : null,
      reviewedAt: w.reviewedAt ?? null,
      reviewedById: w.reviewedById ?? null,
      feedback: w.feedback ?? null,
      doneAt: handedIn ? (w.submittedAt ?? new Date()) : null,
    },
    select: { id: true, publicId: true },
  });
}

/** A video part watched from the start for `seconds`; done once that reaches the whole length. */
export async function seedVideoWork(w: {
  assignmentId: number;
  partId: number;
  studentUserId: number;
  seconds: number;
  durationSeconds: number;
  at: Date;
}) {
  const submission = await submissionFor(w.assignmentId, w.studentUserId);
  return db.assignmentPartWork.create({
    data: {
      publicId: newPublicId(),
      partId: w.partId,
      submissionId: submission.id,
      studentUserId: w.studentUserId,
      watchedIntervals: [[0, w.seconds]],
      watchedSeconds: w.seconds,
      furthestSeconds: w.seconds,
      lastReportAt: w.at,
      doneAt: w.seconds >= w.durationSeconds ? w.at : null,
    },
    select: { id: true },
  });
}

/** The student tapped Submit; `completedAt` too when nothing is left to review. */
export async function markSubmitted(assignmentId: number, studentUserId: number, at: Date, completedAt?: Date) {
  await submissionFor(assignmentId, studentUserId, at, completedAt);
}
