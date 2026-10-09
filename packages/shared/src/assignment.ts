import { z } from "zod";

import { assignmentTypeSchema, submissionStatusSchema } from "./enums";
import { isoDaySchema, wallTimeSchema } from "./org-time";

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
   * The organisation-calendar day `dueAt` falls on (ruling C4/X13). Screens
   * label the deadline with this; formatting `dueAt` on the device would show
   * a different day to a reader in a different zone.
   */
  dueOrgDay: isoDaySchema.nullable(),
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
  /** Org-calendar day of `dueAt` (C2/X13); null when there is no due date. */
  dueOrgDay: isoDaySchema.nullable(),
  /**
   * How far off the deadline is while it has not passed — v1's
   * `formatDistanceToNowStrict(dueAt)` ("3 days", "5 hours"), derived on the
   * server (C4) so device clocks never disagree. Null when there is no due
   * date or it has passed. v1 parity 2026-10-09 (07-assignments R48).
   */
  dueDistance: z.string().nullable(),
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
  /** Org-calendar day and org wall-clock time of `dueAt`; both null when there is no due date. */
  dueOrgDay: isoDaySchema.nullable(),
  dueOrgTime: wallTimeSchema.nullable(),
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

/** v1's form defaulted a picked due date to 23:59 (spec 07 R19). */
export const DEFAULT_DUE_TIME = "23:59";

const assignmentWriteBase = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(20000).nullable().optional(),
  /**
   * The due date as an organisation-calendar day plus wall-clock time. The
   * server composes the instant in config.orgTimezone (ruling C2). v1 sent an
   * instant composed with `setHours` in the author's browser zone (R45), so
   * the same "23:59" meant a different moment per author.
   */
  dueDay: isoDaySchema.nullable().optional(),
  dueTime: wallTimeSchema.nullable().optional(),
  sessionId: z.number().int().positive().nullable().optional(),
  type: assignmentTypeSchema.default("STANDARD"),
  forumMinWords: z.number().int().min(0).max(2000).nullable().optional(),
  forumAllowComments: z.boolean().default(false),
  maxFileSizeMb: z.number().int().min(1).max(100).nullable().optional(),
  allowedMimeCategories: z.array(mimeCategorySchema).default([]),
  /**
   * Targeting. In v1 these two were read off the *raw* request body, never the
   * parsed one, so nothing constrained them at all (R11). They are in the
   * schema now; the server additionally checks each id belongs to the season.
   */
  isAllGroups: z.boolean(),
  groupIds: z.array(z.number().int().positive()).default([]),
});

type AssignmentWriteParsed = z.infer<typeof assignmentWriteBase>;

// v1 parity 2026-10-09 (R13): no targeting refinement. v1
// assignment-actions.ts:73 saves "specific groups" with none chosen: it targets
// nobody, notifies nobody and has expected count 0 — with no publish flag, that
// is how an admin parks one.

/**
 * The type-driven coercion v1 applied in its action bodies (R14–R17), hoisted
 * into the schema so both write paths get it identically and neither can
 * forget it. Duplicate group ids collapse, which is what stops v1's update
 * path from throwing a unique-constraint error mid-transaction (R70).
 */
function normalizeAssignmentWrite(value: AssignmentWriteParsed) {
  const isForum = value.type === "FORUM";
  const dueDay = value.dueDay ?? null;
  return {
    title: value.title,
    description: value.description ?? null,
    dueDay,
    dueTime: dueDay === null ? null : (value.dueTime ?? DEFAULT_DUE_TIME),
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

/**
 * One body for create and for update. A full replace, not a partial merge
 * (spec 07 R67, §8): v1 had no partial update and the edit form always sends
 * every field; PATCH-merge semantics would make "clear the due date" and
 * "leave the due date alone" the same request. `seasonId` is not a field —
 * create takes it from the path and update can never change it (R68).
 */
export const assignmentWriteRequestSchema = assignmentWriteBase.transform(normalizeAssignmentWrite);

/** What a client sends. */
export type AssignmentWriteRequest = z.input<typeof assignmentWriteRequestSchema>;
/** What the server acts on after defaults and type coercion. */
export type AssignmentWriteBody = z.output<typeof assignmentWriteRequestSchema>;

export const createAssignmentRequestSchema = assignmentWriteRequestSchema;
export const updateAssignmentRequestSchema = assignmentWriteRequestSchema;
export type CreateAssignmentRequest = AssignmentWriteRequest;
export type CreateAssignmentBody = AssignmentWriteBody;
export type UpdateAssignmentRequest = AssignmentWriteRequest;
export type UpdateAssignmentBody = AssignmentWriteBody;

/** `DELETE /assignments/:id`. */
export const assignmentDeletedResponseSchema = z.object({ deleted: z.literal(true) });
export type AssignmentDeletedResponse = z.infer<typeof assignmentDeletedResponseSchema>;

/**
 * Outstanding = not yet handed in: PENDING or DRAFT. The exact complement of
 * ruling C5's "completed" set (SUBMITTED | REVIEWED | RETURNED), so
 * outstanding + completed = assignments expected of the student. RETURNED is
 * completed for counting purposes even though the student may revise it.
 * One definition (spec 19 §10 D15): the mobile dashboard count and the
 * server-side dashboard summary both call this.
 */
export function isAssignmentOutstanding(status: AssignmentStudentStatus): boolean {
  return status === "PENDING" || status === "DRAFT";
}
