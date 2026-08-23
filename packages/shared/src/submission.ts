import { z } from "zod";

import { submissionStatusSchema } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Zod rather than bare interfaces, per the convention in CLAUDE.md: the mobile
// client parses every response against these instead of casting, so a backend
// drift fails at the client boundary rather than downstream.

export const updateSubmissionRequestSchema = z.object({
  text: z.string(),
  /** Omitted or false saves a draft; true submits and stamps submittedAt. */
  submit: z.boolean().optional(),
});
export type UpdateSubmissionRequest = z.infer<typeof updateSubmissionRequestSchema>;

/**
 * A reviewer's verdict.
 *
 * `returnForRevision` produces `RETURNED` rather than `REVIEWED`. v1 has
 * `RETURNED` in its vocabulary with no producer anywhere except the seed
 * script, while four call sites read it — it is the state a reviewer needs when
 * the work is not finished, and without it the only way back to editable was
 * v1's accidental one, where saving a draft silently demoted a reviewed
 * submission and dropped it out of the queue.
 */
export const reviewSubmissionRequestSchema = z.object({
  feedback: z.string().max(20000),
  returnForRevision: z.boolean().optional(),
});
export type ReviewSubmissionRequest = z.infer<typeof reviewSubmissionRequestSchema>;

export const submissionFileSummarySchema = z.object({
  id: z.number(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});
export type SubmissionFileSummary = z.infer<typeof submissionFileSummarySchema>;

export const submissionDetailSchema = z.object({
  id: z.number(),
  publicId: z.string(),
  status: submissionStatusSchema,
  text: z.string().nullable(),
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
  files: z.array(submissionFileSummarySchema),
  /**
   * Whether uploading a new file would currently succeed. `false` while
   * ENABLE_UPLOADS is off, so the screen can explain the gap instead of
   * offering a control that returns 503. Reading and deleting recorded files
   * are unaffected either way.
   */
  canUploadFiles: z.boolean(),
  /** Whether this caller may review. Drives what the UI offers, never the gate. */
  canReview: z.boolean(),
});
export type SubmissionDetail = z.infer<typeof submissionDetailSchema>;

/** One row of a reviewer's queue. Deliberately narrower than the detail. */
export const submissionQueueItemSchema = z.object({
  publicId: z.string(),
  status: submissionStatusSchema,
  submittedAt: z.string().nullable(),
  isLate: z.boolean(),
  assignmentId: z.number(),
  assignmentTitle: z.string(),
  assignmentDueAt: z.string().nullable(),
  seasonCode: z.string(),
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
});
export type SubmissionQueueItem = z.infer<typeof submissionQueueItemSchema>;

/**
 * v1's leader queue was unscoped and unpaginated — every submission in every
 * season the reader could reach, in one response. On a phone that is both a
 * privacy problem and a payload problem, so this one is scoped to the caller's
 * own students and returns a page at a time.
 */
export const submissionQueueSchema = z.object({
  items: z.array(submissionQueueItemSchema),
  /** Cursor for the next page; null when this is the last one. */
  nextCursor: z.string().nullable(),
});
export type SubmissionQueue = z.infer<typeof submissionQueueSchema>;

export const submissionQueueQuerySchema = z.object({
  /** Only submissions awaiting a verdict. Defaults to true — it is a queue. */
  pendingOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  seasonId: z.coerce.number().int().positive().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type SubmissionQueueQuery = z.infer<typeof submissionQueueQuerySchema>;
