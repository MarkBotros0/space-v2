import { z } from "zod";

import { userRoleSchema } from "./auth";

/**
 * NoteVisibility's three values are role names (spec R34), but this is a
 * DIFFERENT enum from UserRole with a different domain: plural, no SUPER, no
 * STUDENT. Deriving it from userRoleSchema would mean a future role addition
 * silently becomes a note audience. Declared standalone on purpose (§8).
 *
 * These are matched by EQUALITY, not as a ladder — an ADMIN does not read a
 * LEADERS note. See the plan's divergence ledger row 4 and spec D3.
 */
export const noteVisibilitySchema = z.enum(["LEADERS", "MENTORS", "ADMINS"]);
export type NoteVisibility = z.infer<typeof noteVisibilitySchema>;

/** v1's create bound (R1). v2 applies it to update as well, fixing R25. */
export const NOTE_BODY_MIN = 2;
export const NOTE_BODY_MAX = 20000;

/**
 * `body` is PLAIN TEXT on the wire, in both directions.
 *
 * v1 stores TipTap HTML and renders it raw (R6, spec D1). React Native has no
 * dangerouslySetInnerHTML to inherit, so the wire format is chosen for safety
 * rather than compatibility: the API escapes on write and strips tags on read
 * (including v1's existing rows), and every HTML sink — only email — escapes
 * again. Ruling C11.
 *
 * `canEdit` and `edited` are server-derived (ruling C4). A client must not
 * compare author ids to decide whether to show an edit control, and must not
 * compare timestamps to decide whether a note was amended.
 */
export const noteSummarySchema = z.object({
  id: z.number().int(),
  body: z.string(),
  visibility: noteVisibilitySchema,
  followUpFlagged: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  edited: z.boolean(),
  authorId: z.number().int(),
  // User.name is NOT NULL (schema.prisma), so no nullable here — Plan 15
  // consumes these schemas and must not have to guard a null that cannot occur.
  authorName: z.string(),
  authorRole: userRoleSchema,
  seasonId: z.number().int().nullable(),
  seasonTitle: z.string().nullable(),
  canEdit: z.boolean(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

/** The /me/notes shape: the same note, plus who it is about. */
export const authoredNoteSchema = noteSummarySchema.extend({
  student: z.object({
    id: z.number().int(),
    name: z.string(),
    email: z.string(),
  }),
});
export type AuthoredNote = z.infer<typeof authoredNoteSchema>;

/**
 * `studentUserId` is deliberately NOT a field here — the subject is a path
 * parameter, so a client cannot address a note at a student other than the one
 * named in the URL the gate checked (§8).
 *
 * `seasonId` stays optional: the server defaults it from the student's active
 * season (R4). Spec D12 also floats requiring the caller to name it; §8's own
 * contract table keeps it optional and the composer has no season picker, so
 * D12's first half (the write gate) is adopted and its second half is not.
 */
export const createNoteRequestSchema = z.object({
  body: z.string().min(NOTE_BODY_MIN).max(NOTE_BODY_MAX),
  visibility: noteVisibilitySchema,
  followUpFlagged: z.boolean().default(false),
  seasonId: z.number().int().positive().optional(),
});
export type CreateNoteBody = z.output<typeof createNoteRequestSchema>;

/** Body only (R24 — visibility, flag and season are immutable after creation). */
export const updateNoteRequestSchema = z.object({
  body: z.string().min(NOTE_BODY_MIN).max(NOTE_BODY_MAX),
});
export type UpdateNoteBody = z.output<typeof updateNoteRequestSchema>;

/**
 * Cursor pagination replaces v1's silent 100-row cap (R41), under which a
 * student with a long pastoral history had older notes no surface could reach.
 */
export const noteListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  studentId: z.coerce.number().int().positive().optional(),
});
export type NoteListQuery = z.output<typeof noteListQuerySchema>;

export const noteListResponseSchema = z.object({
  notes: z.array(noteSummarySchema),
  nextCursor: z.string().nullable(),
});

export const authoredNoteListResponseSchema = z.object({
  notes: z.array(authoredNoteSchema),
  nextCursor: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

/** The seven fields of v1's EngagementScore interface (engagement.ts:3-11). */
export const engagementScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  attendancePct: z.number().int().min(0).max(100),
  submissionPct: z.number().int().min(0).max(100),
  attendanceTotal: z.number().int().min(0),
  attendancePresent: z.number().int().min(0),
  submissionsExpected: z.number().int().min(0),
  submissionsCompleted: z.number().int().min(0),
});
export type EngagementScore = z.infer<typeof engagementScoreSchema>;

/** The at-risk threshold, in ONE place. v1 wrote `60` in two files (D7). */
export const AT_RISK_PCT = 60;

/**
 * The single definition of "at risk" (ruling C4, spec D7).
 *
 * v1 had three and they disagreed: absence minutes over budget (dead code),
 * `attendancePct < 60 || submissionPct < 60` on the mentor dashboard, and
 * `score < 60` on reports. This is the component-wise one, because the
 * composite hides exactly the case pastoral staff care about — a student who
 * has stopped turning up but is still submitting.
 *
 * The zero-denominator guards are new. v1 returned 0% for a component with no
 * inputs (R56), so a season with no past sessions flagged its entire cohort
 * on day one. A student cannot be at risk for missing sessions that have not
 * happened.
 */
export function isAtRisk(s: EngagementScore): boolean {
  const attendanceRisk = s.attendanceTotal > 0 && s.attendancePct < AT_RISK_PCT;
  const submissionRisk = s.submissionsExpected > 0 && s.submissionPct < AT_RISK_PCT;
  return attendanceRisk || submissionRisk;
}

/** One student's engagement, staff view. */
export const studentEngagementSchema = engagementScoreSchema.extend({
  studentUserId: z.number().int(),
  seasonId: z.number().int(),
  seasonTitle: z.string().nullable(),
  atRisk: z.boolean(),
});
export type StudentEngagement = z.infer<typeof studentEngagementSchema>;

/**
 * The SAME student's engagement as the student themselves sees it (spec D9).
 *
 * The two components are facts they can act on. The composite is a staff
 * triage number whose threshold exists to sort a cohort, and showing a young
 * person a single "engagement: 47%" figure is a product decision nobody has
 * made. `.strict()` so a server that starts leaking `score` or `atRisk` into
 * this arm fails at the client boundary instead of quietly rendering it.
 */
export const studentSelfEngagementSchema = z
  .object({
    attendancePct: z.number().int().min(0).max(100),
    submissionPct: z.number().int().min(0).max(100),
    attendanceTotal: z.number().int().min(0),
    attendancePresent: z.number().int().min(0),
    submissionsExpected: z.number().int().min(0),
    submissionsCompleted: z.number().int().min(0),
    seasonId: z.number().int(),
    seasonTitle: z.string().nullable(),
  })
  .strict();
export type StudentSelfEngagement = z.infer<typeof studentSelfEngagementSchema>;

/** One row of the cohort endpoint. */
export const engagementRowSchema = studentEngagementSchema.extend({
  studentName: z.string(),
  groupId: z.number().int().nullable(),
  groupName: z.string().nullable(),
});
export type EngagementRow = z.infer<typeof engagementRowSchema>;

export const seasonEngagementResponseSchema = z.object({
  students: z.array(engagementRowSchema),
});
