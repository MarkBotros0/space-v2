import { db } from "../../../db/client";
import type { Prisma } from "../../../generated/prisma/client";
import type { SubmissionStatus } from "../../../generated/prisma/enums";
import {
  countWords,
  partDone,
  parseYouTubeId,
  type AssignmentPart,
  type MimeCategory,
  type PartWork,
} from "../../../../../../packages/shared/src/index";

/*
 * One student's work on each part, as the student and the leader read it. The
 * completion rule is the shared `partDone`; this file only turns rows into the
 * wire shape and names a returned essay's state, and keeps a draft the
 * student's alone.
 */

/** The columns a part's wire shape needs, with its video's question count. */
export const PART_SELECT = {
  id: true,
  position: true,
  kind: true,
  title: true,
  youtubeId: true,
  youtubeUrl: true,
  durationSeconds: true,
  blockSkipping: true,
  prompt: true,
  minWords: true,
  maxWords: true,
  maxFileSizeMb: true,
  allowedMimeCategories: true,
  postToRead: true,
  allowComments: true,
  _count: { select: { videoQuestions: true } },
} satisfies Prisma.AssignmentPartSelect;

export type PartRow = Prisma.AssignmentPartGetPayload<{ select: typeof PART_SELECT }>;

/** A stored part as a reader sees it. */
export function toAssignmentPart(p: PartRow): AssignmentPart {
  const stored = { id: p.id, position: p.position };
  if (p.kind === "VIDEO") {
    const youtubeUrl = p.youtubeUrl ?? `https://www.youtube.com/watch?v=${p.youtubeId ?? ""}`;
    return {
      ...stored,
      kind: "VIDEO",
      title: p.title ?? "",
      youtubeUrl,
      blockSkipping: p.blockSkipping,
      durationSeconds: p.durationSeconds ?? 0,
      videoId: p.youtubeId ?? parseYouTubeId(youtubeUrl),
    };
  }
  if (p.kind === "ESSAY") {
    return {
      ...stored,
      kind: "ESSAY",
      prompt: p.prompt ?? "",
      minWords: p.minWords,
      maxWords: p.maxWords,
      maxFileSizeMb: p.maxFileSizeMb,
      allowedMimeCategories: p.allowedMimeCategories as MimeCategory[],
    };
  }
  return {
    ...stored,
    kind: "FORUM",
    prompt: p.prompt ?? "",
    minWords: p.minWords,
    postToRead: p.postToRead,
    allowComments: p.allowComments,
  };
}

/** The columns of a student's work row a reader needs. */
const WORK_SELECT = {
  partId: true,
  studentUserId: true,
  publicId: true,
  text: true,
  status: true,
  feedback: true,
  reviewedAt: true,
  watchedSeconds: true,
} satisfies Prisma.AssignmentPartWorkSelect;

export type WorkRow = Prisma.AssignmentPartWorkGetPayload<{ select: typeof WORK_SELECT }>;

interface AnswerTally {
  answered: number;
  correct: number;
}

const workKey = (partId: number, studentUserId: number) => `${partId}:${studentUserId}`;

/**
 * Who has which work: the rows for these parts and students, and each
 * student's timed-question answers per video part. Two queries however many.
 */
export async function loadWorkIndex(partIds: number[], studentUserIds: number[]) {
  if (partIds.length === 0 || studentUserIds.length === 0) {
    return { works: new Map<string, WorkRow>(), answers: new Map<string, AnswerTally>() };
  }
  const [rows, responses] = await Promise.all([
    db.assignmentPartWork.findMany({
      where: { partId: { in: partIds }, studentUserId: { in: studentUserIds } },
      select: WORK_SELECT,
    }),
    db.sessionVideoQuestionResponse.findMany({
      where: { studentUserId: { in: studentUserIds }, question: { assignmentPartId: { in: partIds } } },
      select: { studentUserId: true, isCorrect: true, question: { select: { assignmentPartId: true } } },
    }),
  ]);
  const works = new Map(rows.map((w) => [workKey(w.partId, w.studentUserId), w]));
  const answers = new Map<string, AnswerTally>();
  for (const r of responses) {
    if (r.question.assignmentPartId === null) continue;
    const key = workKey(r.question.assignmentPartId, r.studentUserId);
    const tally = answers.get(key) ?? { answered: 0, correct: 0 };
    tally.answered += 1;
    if (r.isCorrect) tally.correct += 1;
    answers.set(key, tally);
  }
  return { works, answers };
}

export type WorkIndex = Awaited<ReturnType<typeof loadWorkIndex>>;

/**
 * A student's work on each part, in the parts' order. `forStaff` hides a draft
 * (an essay or forum post nobody has handed in): it is the student's alone, so
 * the leader sees that part as not started.
 */
export function partWorksFor(
  parts: PartRow[],
  studentUserId: number,
  index: WorkIndex,
  opts: { forStaff: boolean },
): PartWork[] {
  return parts.map((p) => {
    const key = workKey(p.id, studentUserId);
    const row = index.works.get(key);
    const visible = row && !(opts.forStaff && row.status === "DRAFT" && p.kind !== "VIDEO") ? row : undefined;
    return toPartWork(p, visible, index.answers.get(key) ?? { answered: 0, correct: 0 });
  });
}

function toPartWork(p: PartRow, row: WorkRow | undefined, tally: AnswerTally): PartWork {
  if (p.kind === "VIDEO") return videoWork(p, row, tally);
  if (p.kind === "ESSAY") return essayWork(p, row);
  const posted = row !== undefined && row.status !== "DRAFT";
  const status = posted ? "DONE" : row ? "IN_PROGRESS" : "NOT_STARTED";
  return { partId: p.id, kind: p.kind, status, forum: { posted } };
}

function videoWork(p: PartRow, row: WorkRow | undefined, tally: AnswerTally): PartWork {
  const video = {
    watchedSeconds: row?.watchedSeconds ?? 0,
    durationSeconds: p.durationSeconds ?? 0,
    answered: tally.answered,
    questionCount: p._count.videoQuestions,
    correct: tally.correct,
  };
  const work: PartWork = { partId: p.id, kind: p.kind, status: "NOT_STARTED", video };
  if (partDone(toAssignmentPart(p), work)) return { ...work, status: "DONE" };
  return video.watchedSeconds > 0 || video.answered > 0 ? { ...work, status: "IN_PROGRESS" } : work;
}

function essayWork(p: PartRow, row: WorkRow | undefined): PartWork {
  if (!row) return { partId: p.id, kind: p.kind, status: "NOT_STARTED" };
  const essay = {
    publicId: row.publicId,
    wordCount: countWords(row.text ?? ""),
    reviewStatus: row.status,
    feedback: row.feedback,
  };
  const work: PartWork = { partId: p.id, kind: p.kind, status: "IN_PROGRESS", essay };
  // The shared rule says done; RETURNED is only the word for a returned essay.
  if (partDone(toAssignmentPart(p), work)) return { ...work, status: "DONE" };
  return row.status === "RETURNED" ? { ...work, status: "RETURNED" } : work;
}

/** How far a student is through one assignment, from their part works. */
interface AssignmentStanding {
  partsTotal: number;
  partsDone: number;
  returned: boolean;
}

export function standingOf(works: PartWork[]): AssignmentStanding {
  return {
    partsTotal: works.length,
    partsDone: works.filter((w) => w.status === "DONE").length,
    returned: works.some((w) => w.status === "RETURNED"),
  };
}

/**
 * The one status word for a student's assignment, in the old vocabulary the
 * lists and records still carry: PENDING (nothing yet), DRAFT (started, not
 * submitted), SUBMITTED, REVIEWED (submitted and every essay reviewed) or
 * RETURNED (an essay came back). An assignment with no essay stays SUBMITTED.
 */
export function assignmentStatusOf(
  submittedAt: Date | null,
  works: PartWork[],
  hasSubmission: boolean,
): SubmissionStatus | "PENDING" {
  if (works.some((w) => w.status === "RETURNED")) return "RETURNED";
  if (submittedAt === null) return hasSubmission ? "DRAFT" : "PENDING";
  const essays = works.filter((w) => w.kind === "ESSAY");
  if (essays.length > 0 && essays.every((w) => w.essay?.reviewStatus === "REVIEWED")) return "REVIEWED";
  return "SUBMITTED";
}

/** The latest review of a student's essays on these parts, once every essay is reviewed. */
export function reviewedAtOf(parts: PartRow[], studentUserId: number, index: WorkIndex): Date | null {
  const essays = parts.filter((p) => p.kind === "ESSAY").map((p) => index.works.get(workKey(p.id, studentUserId)));
  if (essays.length === 0 || essays.some((w) => w?.status !== "REVIEWED")) return null;
  return essays.reduce<Date | null>((latest, w) => {
    const at = w?.reviewedAt ?? null;
    return at !== null && (latest === null || at > latest) ? at : latest;
  }, null);
}

/** `loadPartWorks`: one student's work on one assignment's parts, as they read it. */
export async function loadPartWorks(assignmentId: number, studentUserId: number): Promise<PartWork[]> {
  const parts = await db.assignmentPart.findMany({
    where: { assignmentId },
    orderBy: { position: "asc" },
    select: PART_SELECT,
  });
  const index = await loadWorkIndex(
    parts.map((p) => p.id),
    [studentUserId],
  );
  return partWorksFor(parts, studentUserId, index, { forStaff: false });
}
