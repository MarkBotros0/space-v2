import { db } from "../../db/client";
import type { SubmissionStatus } from "../../generated/prisma/enums";

/*
 * Assignments with parts, and students' work on them, written straight to the
 * database for the read suites. The writes themselves are tested by their own
 * suites (assignment-writes-*, submissions-*, forum-*, assignment-video-*).
 */

type PartSeed =
  | { kind: "VIDEO"; title?: string; durationSeconds?: number; questions?: number }
  | { kind: "ESSAY"; prompt?: string; minWords?: number | null; maxWords?: number | null }
  | { kind: "FORUM"; prompt?: string };

function partData(p: PartSeed, position: number) {
  if (p.kind === "VIDEO") {
    return {
      position,
      kind: "VIDEO" as const,
      title: p.title ?? "Watch this",
      youtubeId: "dQw4w9WgXcQ",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      durationSeconds: p.durationSeconds ?? 600,
    };
  }
  if (p.kind === "ESSAY") {
    return {
      position,
      kind: "ESSAY" as const,
      prompt: p.prompt ?? "What did you learn?",
      minWords: p.minWords ?? null,
      maxWords: p.maxWords ?? null,
    };
  }
  return { position, kind: "FORUM" as const, prompt: p.prompt ?? "Share one idea" };
}

/** An assignment and its parts, in order. Returns the id and the part ids. */
export async function createAssignmentWithParts(
  data: { seasonId: number; title: string; dueAt?: Date | null; deletedAt?: Date | null; description?: string },
  parts: PartSeed[] = [{ kind: "ESSAY" }],
): Promise<{ id: number; partIds: number[] }> {
  const a = await db.assignment.create({
    data: { ...data, parts: { create: parts.map(partData) } },
    select: { id: true, parts: { orderBy: { position: "asc" }, select: { id: true, kind: true } } },
  });
  for (const [i, p] of parts.entries()) {
    if (p.kind !== "VIDEO" || !p.questions) continue;
    await db.sessionVideoQuestion.createMany({
      data: Array.from({ length: p.questions }, (_, q) => ({
        assignmentPartId: a.parts[i]!.id,
        atSeconds: 10 * (q + 1),
        prompt: `Question ${q + 1}`,
        options: ["Yes", "No"],
        correctIndex: 0,
      })),
    });
  }
  return { id: a.id, partIds: a.parts.map((p) => p.id) };
}

let seq = 0;

/** The student's Submission row, made if missing; `submittedAt` set only when given. */
async function ensureSubmission(assignmentId: number, studentUserId: number, submittedAt?: Date | null) {
  return db.submission.upsert({
    where: { assignmentId_studentUserId: { assignmentId, studentUserId } },
    create: {
      assignmentId,
      studentUserId,
      publicId: `space-v2-test-sub-${assignmentId}-${studentUserId}`,
      submittedAt: submittedAt ?? null,
    },
    update: submittedAt === undefined ? {} : { submittedAt },
    select: { id: true, publicId: true },
  });
}

/** Mark the student's assignment submitted (or not, with null). */
export async function setSubmitted(assignmentId: number, studentUserId: number, at: Date | null) {
  return ensureSubmission(assignmentId, studentUserId, at);
}

/**
 * A student's essay or forum post. A handed-in status stamps the work's
 * `submittedAt`; REVIEWED and RETURNED also its `reviewedAt` (`at` for both).
 */
export async function seedTextWork(
  assignmentId: number,
  partId: number,
  studentUserId: number,
  status: SubmissionStatus,
  opts: { at?: Date; text?: string; feedback?: string | null; publicId?: string } = {},
) {
  const at = opts.at ?? new Date();
  const submission = await ensureSubmission(assignmentId, studentUserId);
  seq += 1;
  return db.assignmentPartWork.create({
    data: {
      publicId: opts.publicId ?? `space-v2-test-work-${partId}-${studentUserId}-${seq}`,
      partId,
      submissionId: submission.id,
      studentUserId,
      status,
      text: opts.text ?? "Some words here",
      feedback: opts.feedback ?? null,
      submittedAt: status === "DRAFT" ? null : at,
      reviewedAt: status === "REVIEWED" || status === "RETURNED" ? at : null,
    },
    select: { id: true, publicId: true },
  });
}

/** A student's watching of a video part, and their answers to its first `answered` questions. */
export async function seedVideoWork(
  assignmentId: number,
  partId: number,
  studentUserId: number,
  watchedSeconds: number,
  opts: { answered?: number; correct?: number } = {},
) {
  const submission = await ensureSubmission(assignmentId, studentUserId);
  seq += 1;
  await db.assignmentPartWork.create({
    data: {
      publicId: `space-v2-test-video-${partId}-${studentUserId}-${seq}`,
      partId,
      submissionId: submission.id,
      studentUserId,
      watchedIntervals: [[0, watchedSeconds]],
      watchedSeconds,
      furthestSeconds: watchedSeconds,
    },
  });
  const questions = await db.sessionVideoQuestion.findMany({
    where: { assignmentPartId: partId },
    orderBy: { atSeconds: "asc" },
    take: opts.answered ?? 0,
    select: { id: true },
  });
  await db.sessionVideoQuestionResponse.createMany({
    data: questions.map((q, i) => ({
      questionId: q.id,
      studentUserId,
      selectedIndex: 0,
      isCorrect: i < (opts.correct ?? questions.length),
    })),
  });
}

/** One essay in the old one-row shape: the status, and when it was handed in and reviewed. */
export interface EssaySeed {
  assignmentId: number;
  studentUserId: number;
  status: SubmissionStatus;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  publicId?: string;
  text?: string;
  feedback?: string | null;
  /** The Submission row's createdAt, for suites that order by it. */
  createdAt?: Date;
}

/**
 * Essays on each assignment's first essay part, from the old one-row shape. The
 * Submission is stamped submitted (at the essay's `submittedAt`) for SUBMITTED
 * and REVIEWED; a RETURNED essay reopens its assignment, a DRAFT never closed it.
 */
export async function seedEssays(rows: EssaySeed[]): Promise<Array<{ id: number; publicId: string }>> {
  const out: Array<{ id: number; publicId: string }> = [];
  for (const r of rows) {
    const part = await db.assignmentPart.findFirstOrThrow({
      where: { assignmentId: r.assignmentId, kind: "ESSAY" },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const handedIn = r.status === "SUBMITTED" || r.status === "REVIEWED";
    const submittedAt = r.submittedAt ?? (r.status === "DRAFT" ? null : new Date());
    const submission = await ensureSubmission(r.assignmentId, r.studentUserId, handedIn ? submittedAt : null);
    if (r.createdAt) await db.submission.update({ where: { id: submission.id }, data: { createdAt: r.createdAt } });
    seq += 1;
    out.push(
      await db.assignmentPartWork.create({
        data: {
          publicId: r.publicId ?? `space-v2-test-essay-${part.id}-${r.studentUserId}-${seq}`,
          partId: part.id,
          submissionId: submission.id,
          studentUserId: r.studentUserId,
          status: r.status,
          text: r.text ?? "Some words here",
          feedback: r.feedback ?? null,
          submittedAt,
          reviewedAt: r.reviewedAt ?? null,
        },
        select: { id: true, publicId: true },
      }),
    );
  }
  return out;
}
