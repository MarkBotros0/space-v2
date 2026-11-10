import { z } from "zod";

import { assignmentPartSchema, partWorkSchema, assignmentPartInputSchema } from "./assignment-parts";
import { reminderAnchorSchema, submissionStatusSchema } from "./enums";
import { isoDaySchema, wallTimeSchema } from "./org-time";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Zod rather than bare interfaces, per the convention in CLAUDE.md: the mobile
// client parses every response against these instead of casting, so a backend
// drift fails at the client boundary rather than downstream.

/**
 * A student's state on one assignment.
 *
 * `PENDING` is a wire-only sentinel meaning "no Submission row exists". It is
 * deliberately NOT a member of the Prisma `SubmissionStatus` enum — adding it
 * there would be a migration, and the absence of a row is not a status the
 * database should have to represent.
 */
const assignmentStudentStatusSchema = z.union([submissionStatusSchema, z.literal("PENDING")]);

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
  /** Org-calendar day of `dueAt` (X13); label and compare with this, not the device zone. */
  dueOrgDay: isoDaySchema.nullable(),
  isOverdue: z.boolean(),
  status: assignmentStudentStatusSchema,
  reviewedAt: z.string().nullable(),
  /** When they last handed it in. Optional: a backend from before 2026-11-07 doesn't send it. */
  submittedAt: z.string().nullable().optional(),
});
export type StudentAssignmentListItem = z.infer<typeof studentAssignmentListItemSchema>;

const reminderSchema = z.object({
  enabled: z.boolean(),
  days: z.number().int().min(1).max(14),
  anchor: reminderAnchorSchema,
  time: wallTimeSchema,
});
export type Reminder = z.infer<typeof reminderSchema>;

export const assignmentDetailSchema = z.object({
  id: z.number(),
  seasonId: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  dueAt: z.string().nullable(),
  /** Org-calendar day and org wall-clock time of `dueAt`; both null when there is no due date. */
  dueOrgDay: isoDaySchema.nullable(),
  dueOrgTime: wallTimeSchema.nullable(),
  isOverdue: z.boolean(),
  reminder: reminderSchema,
  /** The reminder in words ("2 days before the next session"); null when it is off. */
  reminderLine: z.string().nullable(),
  parts: z.array(assignmentPartSchema),
  /** Present only for students; null for everyone else. */
  my: z.object({ submittedAt: z.string().nullable(), parts: z.array(partWorkSchema) }).nullable(),
  /** Whether this caller may edit or delete the assignment. Drives the UI, never the gate. */
  canManage: z.boolean(),
  /** True for a student whose enrolment is no longer ACTIVE: they can read this, not change it. */
  readOnly: z.boolean(),
});
export type AssignmentDetail = z.infer<typeof assignmentDetailSchema>;

/** The leader's view: every expected student with their work on each part. */
export const assignmentProgressSchema = z.object({
  rows: z.array(
    z.object({
      studentUserId: z.number(),
      name: z.string().nullable(),
      avatarPath: z.string().nullable(),
      submittedAt: z.string().nullable(),
      parts: z.array(partWorkSchema),
    }),
  ),
});
export type AssignmentProgress = z.infer<typeof assignmentProgressSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/** v1's form defaulted a picked due date to 23:59 (spec 07 R19). */
export const DEFAULT_DUE_TIME = "23:59";

/**
 * One body for create and for update. A full replace, not a partial merge
 * (spec 07 R67, §8): v1 had no partial update and the edit form always sends
 * every field; PATCH-merge semantics would make "clear the due date" and
 * "leave the due date alone" the same request. `seasonId` is not a field —
 * create takes it from the path and update can never change it (R68).
 *
 * `dueDay` and `dueTime` are an organisation-calendar day plus wall-clock
 * time; the server composes the instant in config.orgTimezone (ruling C2).
 */
export const assignmentWriteRequestSchema = z
  .object({
    title: z.string().min(2).max(160),
    description: z.string().max(20000).nullable(),
    dueDay: isoDaySchema.nullable(),
    dueTime: wallTimeSchema.nullable(),
    reminder: reminderSchema,
    parts: z
      .array(assignmentPartInputSchema)
      .min(1, "Add at least one part")
      .max(20)
      .refine((parts) => parts.filter((p) => p.kind === "FORUM").length <= 1, "One forum per assignment"),
    /** Re-sent with true to confirm a save the server flagged (for example, one that returns work). */
    confirm: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reminder.anchor === "DUE_DATE" && value.dueDay === null) {
      ctx.addIssue({ code: "custom", path: ["reminder", "anchor"], message: "Set a due date first" });
    }
  });

/** What a client sends. */
export type AssignmentWriteRequest = z.input<typeof assignmentWriteRequestSchema>;
/** What the server acts on. */
export type AssignmentWriteBody = z.output<typeof assignmentWriteRequestSchema>;

export const createAssignmentRequestSchema = assignmentWriteRequestSchema;
export const updateAssignmentRequestSchema = assignmentWriteRequestSchema;

/** `DELETE /assignments/:id`. */
export const assignmentDeletedResponseSchema = z.object({ deleted: z.literal(true) });
