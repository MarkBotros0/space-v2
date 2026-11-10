import { z } from "zod";

import { submissionStatusSchema } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Zod rather than bare interfaces, per the convention in CLAUDE.md: the mobile
// client parses every response against these instead of casting, so a backend
// drift fails at the client boundary rather than downstream.

/** `PUT /assignments/:id/parts/:partId/essay`: save the essay's draft. Never hands it in. */
export const saveEssayDraftRequestSchema = z.object({
  // The same cap as a forum response and a review's feedback.
  text: z.string().max(20_000),
});

/** The essay work the draft was saved to (made on the first save) and its count. */
export const saveEssayDraftResponseSchema = z.object({
  /** The essay work's handle: files, the detail and a hand-in address it. */
  publicId: z.string(),
  wordCount: z.number().int().nonnegative(),
  reviewStatus: submissionStatusSchema,
});

/**
 * Why an essay can't be handed in at this count (`essayWordCount`), or null
 * when it can. An essay needs typed words whatever its range:
 * files are extras, never the essay.
 */
export function essayWordRangeMessage(words: number, min: number | null, max: number | null): string | null {
  const counted = `This is ${words} ${words === 1 ? "word" : "words"}`;
  if (words === 0) return "Write your essay before handing it in.";
  if (min !== null && words < min) return `${counted}; it needs at least ${min}.`;
  if (max !== null && words > max) return `${counted}; it needs at most ${max}.`;
  return null;
}

/** `POST /submissions/:publicId/hand-in`: a returned essay, handed in again. */
export const handInEssayResponseSchema = z.object({
  reviewStatus: z.literal("SUBMITTED"),
  /** True when every part is done again, so the assignment counts as submitted. */
  assignmentSubmitted: z.boolean(),
});

/**
 * A reviewer's verdict on one essay. `reviewed` may carry feedback; `return`
 * sends the essay back to the student and needs a note saying what to change.
 */
export const reviewEssayRequestSchema = z
  .object({
    action: z.enum(["reviewed", "return"]),
    feedback: z.string().max(20_000).nullable(),
  })
  .refine((v) => v.action !== "return" || (v.feedback ?? "").trim() !== "", {
    message: "Say what to change",
    path: ["feedback"],
  });

/** `POST /submissions/:publicId/review` success payload. */
export const reviewEssayResponseSchema = z.object({
  reviewStatus: z.enum(["REVIEWED", "RETURNED"]),
});

const submissionFileSummarySchema = z.object({
  id: z.number(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});

/**
 * One student's essay: the essay work (`publicId` is the work's), its part's
 * question and limits, and the assignment it belongs to.
 */
export const submissionDetailSchema = z.object({
  id: z.number(),
  publicId: z.string(),
  status: submissionStatusSchema,
  text: z.string().nullable(),
  wordCount: z.number().int().nonnegative(),
  partId: z.number(),
  prompt: z.string(),
  minWords: z.number().nullable(),
  maxWords: z.number().nullable(),
  /** Null: this essay takes no files. */
  maxFileSizeMb: z.number().nullable(),
  allowedMimeCategories: z.array(z.string()),
  feedback: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /**
   * Derived server-side (ruling C4): `submittedAt` is after the assignment's
   * `dueAt`. False when either is absent. v1 recomputed this comparison at five
   * separate render sites with no shared helper.
   */
  isLate: z.boolean(),
  assignmentId: z.number(),
  assignmentTitle: z.string(),
  assignmentDueAt: z.string().nullable(),
  assignmentDescription: z.string().nullable(),
  seasonCode: z.string(),
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  studentEmail: z.string(),
  /**
   * The student's group in THIS assignment's season, from their enrolment
   * (ruling C9) — v1's detail named it, v2's dropped it (REG-89).
   */
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
  files: z.array(submissionFileSummarySchema),
  /**
   * Whether uploading a new file would currently succeed: the essay takes files
   * and ENABLE_UPLOADS is on, so the screen can explain the gap instead of
   * offering a control that is refused. Reading and deleting recorded files
   * are unaffected either way.
   */
  canUploadFiles: z.boolean(),
  /** Whether this caller may review. Drives what the UI offers, never the gate. */
  canReview: z.boolean(),
});
export type SubmissionDetail = z.infer<typeof submissionDetailSchema>;

/** One row of a reviewer's queue: one essay of one student. Deliberately narrower than the detail. */
const submissionQueueItemSchema = z.object({
  /** The essay work's handle into the review screen. */
  publicId: z.string(),
  assignmentId: z.number(),
  assignmentTitle: z.string(),
  prompt: z.string(),
  studentName: z.string().nullable(),
  submittedAt: z.string().nullable(),
  isLate: z.boolean(),
  reviewStatus: submissionStatusSchema,
});
export type SubmissionQueueItem = z.infer<typeof submissionQueueItemSchema>;

/**
 * v1's queue header: "N pending review · M total · K late" (REG-89). Counted
 * over everything the caller's scope (and the seasonId filter) reaches,
 * ignoring `pendingOnly` and paging, so the header does not change as the list
 * is filtered or scrolled. DRAFTs are never counted.
 */
const submissionQueueCountsSchema = z.object({
  /** Essays handed in and awaiting a verdict. */
  pending: z.number().int().nonnegative(),
  /** Every essay in scope that was handed in (a draft never counts). */
  total: z.number().int().nonnegative(),
  /** Essays handed in after the assignment's due date. */
  late: z.number().int().nonnegative(),
});

/**
 * v1's leader queue was unscoped and unpaginated. This one is scoped to the
 * caller's own students, lists essays (one item per student per essay), and
 * returns a page at a time.
 */
export const submissionQueueSchema = z.object({
  items: z.array(submissionQueueItemSchema),
  /**
   * First page only. A page fetched with `cursor` carries null: the counts do
   * not change as the list is scrolled, so recounting the whole reachable set
   * on every page was pure cost. Clients read `pages[0].counts`.
   */
  counts: submissionQueueCountsSchema.nullable(),
  /** Cursor for the next page; null when this is the last one. */
  nextCursor: z.string().nullable(),
});
export type SubmissionQueue = z.infer<typeof submissionQueueSchema>;

export const submissionQueueQuerySchema = z.object({
  /** Only essays awaiting a verdict. Defaults to true — it is a queue. */
  pendingOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  seasonId: z.coerce.number().int().positive().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
