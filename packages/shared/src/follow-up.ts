import { z } from "zod";

/**
 * A mentor's follow-ups (owner, 2026-11-07). A mentor flags a student to come
 * back to; it is due FOLLOW_UP_DAYS later, the daily reminder sends one
 * notification to that mentor alone, and it stays open until marked done.
 */
export const FOLLOW_UP_DAYS = 7;
export const FOLLOW_UP_REASON_MAX = 500;

export const followUpSchema = z.object({
  id: z.number(),
  studentUserId: z.number(),
  studentName: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  dueAt: z.string(),
  remindedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

/** `GET /follow-ups`: open ones by `dueAt`, then those done in the last 30 days, newest first. */
export const followUpListSchema = z.object({ followUps: z.array(followUpSchema) });

/** `POST /students/:id/follow-ups`. An empty reason is stored as none. */
export const createFollowUpRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(FOLLOW_UP_REASON_MAX)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type CreateFollowUpBody = z.input<typeof createFollowUpRequestSchema>;

/** `GET /me/mentor-summary`: the four numbers on the mentor's Home. */
export const mentorSummarySchema = z.object({
  followUpsDue: z.number(),
  absentLately: z.number(),
  notesThisWeek: z.number(),
  students: z.number(),
});
export type MentorSummary = z.infer<typeof mentorSummarySchema>;
