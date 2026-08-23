import { z } from "zod";

import { assignmentTypeSchema, submissionStatusSchema } from "./enums";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Zod rather than bare interfaces, per the convention in CLAUDE.md: the mobile
// client parses every response against these instead of casting, so a backend
// drift fails at the client boundary rather than downstream.

/**
 * The six MIME buckets an assignment may restrict uploads to. An empty array
 * means "any type" — there is no "all" member.
 */
export const mimeCategorySchema = z.enum(["image", "pdf", "doc", "audio", "video", "text"]);
export type MimeCategory = z.infer<typeof mimeCategorySchema>;

/**
 * A student's state on one assignment.
 *
 * `PENDING` is a wire-only sentinel meaning "no Submission row exists". It is
 * deliberately NOT a member of the Prisma `SubmissionStatus` enum — adding it
 * there would be a migration, and the absence of a row is not a status the
 * database should have to represent.
 */
export const assignmentStudentStatusSchema = z.union([
  submissionStatusSchema,
  z.literal("PENDING"),
]);
export type AssignmentStudentStatus = z.infer<typeof assignmentStudentStatusSchema>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

/** What GET /assignments returns to staff (SUPER/ADMIN/LEADER/MENTOR). */
export const staffAssignmentListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  dueAt: z.string().nullable(),
  /**
   * Derived server-side (ruling C4): `dueAt` is in the past. Never re-derive
   * this on the client — a device in another timezone would disagree with the
   * badge its leader is looking at.
   */
  isOverdue: z.boolean(),
  isAllGroups: z.boolean(),
  /**
   * The groups this assignment targets. Empty when `isAllGroups` — v1's list
   * could say "Some groups" but not which, because it never selected them.
   */
  targetGroupIds: z.array(z.number()),
  submissionCount: z.number(),
  expectedCount: z.number(),
  seasonCode: z.string(),
});
export type StaffAssignmentListItem = z.infer<typeof staffAssignmentListItemSchema>;

/** What the same endpoint returns to a STUDENT. */
export const studentAssignmentListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  dueAt: z.string().nullable(),
  isOverdue: z.boolean(),
  status: assignmentStudentStatusSchema,
  reviewedAt: z.string().nullable(),
});
export type StudentAssignmentListItem = z.infer<typeof studentAssignmentListItemSchema>;

/**
 * The union the list endpoint returns. A hook cannot parse against this
 * blindly — pick the arm by the caller's own role and parse against that,
 * rather than letting a union quietly accept the wrong shape.
 */
export const assignmentListItemSchema = z.union([
  staffAssignmentListItemSchema,
  studentAssignmentListItemSchema,
]);
export type AssignmentListItem = z.infer<typeof assignmentListItemSchema>;

export const mySubmissionSummarySchema = z.object({
  publicId: z.string(),
  status: submissionStatusSchema,
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  feedback: z.string().nullable(),
  /**
   * Derived server-side (ruling C4): submitted after the due date. False when
   * either timestamp is absent.
   */
  isLate: z.boolean(),
});
export type MySubmissionSummary = z.infer<typeof mySubmissionSummarySchema>;

export const assignmentDetailSchema = z.object({
  id: z.number(),
  seasonId: z.number(),
  seasonCode: z.string(),
  seasonTitle: z.string(),
  sessionId: z.number().nullable(),
  sessionTitle: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.string().nullable(),
  isOverdue: z.boolean(),
  isAllGroups: z.boolean(),
  type: assignmentTypeSchema,
  forumMinWords: z.number().nullable(),
  forumAllowComments: z.boolean(),
  /** Null means this assignment accepts no file uploads — there is no separate flag. */
  maxFileSizeMb: z.number().nullable(),
  allowedMimeCategories: z.array(mimeCategorySchema),
  /**
   * Which groups the assignment targets — **null for students**, who have no
   * business enumerating the group ids of an assignment (ruling C8: narrow the
   * payload, not just the access). v1 handed students the full authoring shape
   * so its student page could re-check its own targeting; v2 does that check
   * server-side instead.
   */
  groupIds: z.array(z.number()).nullable(),
  /** Present only for students; null for everyone else. */
  mySubmission: mySubmissionSummarySchema.nullable(),
  /** Whether this caller may edit or delete the assignment. Drives the UI, never the gate. */
  canManage: z.boolean(),
});
export type AssignmentDetail = z.infer<typeof assignmentDetailSchema>;

/** One row of the per-assignment submission tracker. */
export const assignmentTrackerRowSchema = z.object({
  studentUserId: z.number(),
  name: z.string().nullable(),
  email: z.string(),
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
  status: assignmentStudentStatusSchema,
  /** Derived server-side (ruling C4), never recomputed by a renderer. */
  isLate: z.boolean(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  /** The handle into the submission review screen; null when nothing was started. */
  submissionPublicId: z.string().nullable(),
});
export type AssignmentTrackerRow = z.infer<typeof assignmentTrackerRowSchema>;

export const assignmentTrackerSchema = z.object({
  assignmentId: z.number(),
  dueAt: z.string().nullable(),
  isOverdue: z.boolean(),
  /** Non-DRAFT submissions among `rows`. The one definition of "submitted". */
  submittedCount: z.number(),
  expectedCount: z.number(),
  rows: z.array(assignmentTrackerRowSchema),
});
export type AssignmentTracker = z.infer<typeof assignmentTrackerSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const assignmentWriteBase = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(20000).nullable().optional(),
  /** ISO-8601 instant. Wall-clock composition happens before the wire, never here. */
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  sessionId: z.number().int().positive().nullable().optional(),
  type: assignmentTypeSchema.default("STANDARD"),
  forumMinWords: z.number().int().min(0).max(2000).nullable().optional(),
  forumAllowComments: z.boolean().default(false),
  maxFileSizeMb: z.number().int().min(1).max(100).nullable().optional(),
  allowedMimeCategories: z.array(mimeCategorySchema).default([]),
  /**
   * Targeting. In v1 these two were read off the *raw* request body, never the
   * parsed one, so nothing constrained them at all. They are in the schema now.
   */
  isAllGroups: z.boolean(),
  groupIds: z.array(z.number().int().positive()).default([]),
});

type AssignmentWriteParsed = z.infer<typeof assignmentWriteBase>;

/**
 * Deliberate divergence from v1: "specific groups" with an empty list is
 * rejected rather than silently accepted. v1 wrote an assignment that targeted
 * nobody, notified nobody and had an expected count of zero — indistinguishable
 * from a save that worked.
 */
function refineTargeting(value: AssignmentWriteParsed, ctx: z.RefinementCtx): void {
  if (!value.isAllGroups && value.groupIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["groupIds"],
      message: "Choose at least one group, or target the whole season.",
    });
  }
}

/**
 * The type-driven coercion v1 applied in its action bodies, hoisted into the
 * schema so both write paths get it identically and neither can forget it.
 *
 * A FORUM assignment cannot hold file settings; a STANDARD one cannot hold
 * forum settings. Duplicate group ids collapse, which is what stops v1's
 * update path from throwing a unique-constraint error mid-transaction.
 */
function normalizeAssignmentWrite(value: AssignmentWriteParsed) {
  const isForum = value.type === "FORUM";
  return {
    title: value.title,
    description: value.description ?? null,
    dueAt: value.dueAt ?? null,
    sessionId: value.sessionId ?? null,
    type: value.type,
    forumMinWords: isForum ? (value.forumMinWords ?? null) : null,
    forumAllowComments: isForum ? value.forumAllowComments : false,
    maxFileSizeMb: isForum ? null : (value.maxFileSizeMb ?? null),
    allowedMimeCategories: isForum ? [] : value.allowedMimeCategories,
    isAllGroups: value.isAllGroups,
    groupIds: value.isAllGroups ? [] : Array.from(new Set(value.groupIds)),
  };
}

export const createAssignmentRequestSchema = assignmentWriteBase
  .extend({
    /**
     * The owning season. Set once, here — `PATCH` has no `seasonId` at all,
     * because an assignment can never move between seasons.
     */
    seasonId: z.number().int().positive(),
  })
  .superRefine(refineTargeting)
  .transform((value) => ({ ...normalizeAssignmentWrite(value), seasonId: value.seasonId }));

/** What a client sends. */
export type CreateAssignmentRequest = z.input<typeof createAssignmentRequestSchema>;
/** What the server acts on after defaults and type coercion. */
export type CreateAssignmentBody = z.output<typeof createAssignmentRequestSchema>;

/**
 * A full replace, not a partial merge. v1 had no partial update and the edit
 * form always sends every field; inventing PATCH-merge semantics here would
 * make "clear the due date" and "leave the due date alone" the same request.
 */
export const updateAssignmentRequestSchema = assignmentWriteBase
  .superRefine(refineTargeting)
  .transform(normalizeAssignmentWrite);

export type UpdateAssignmentRequest = z.input<typeof updateAssignmentRequestSchema>;
export type UpdateAssignmentBody = z.output<typeof updateAssignmentRequestSchema>;
