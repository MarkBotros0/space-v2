import { z } from "zod";

// ---------------------------------------------------------------------------
// The live screen (staff): every student in scope, where they are right now.
// Carries no answer content.
// ---------------------------------------------------------------------------

const quizLiveStateSchema = z.enum([
  "not_started",
  "in_progress",
  "submitted",
  "graded",
  "timed_out",
  "ended_by_exits",
  "ended_by_staff",
]);
export type QuizLiveState = z.infer<typeof quizLiveStateSchema>;

const quizLiveRowSchema = z.object({
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  groupName: z.string().nullable(),
  state: quizLiveStateSchema,
  /** The open attempt's deadline; null when untimed, not started, or the attempt is over. */
  deadlineAt: z.string().nullable(),
  /** EXIT + RELAUNCH events of the latest attempt. */
  exits: z.number(),
  lastExitAt: z.string().nullable(),
});
export type QuizLiveRow = z.infer<typeof quizLiveRowSchema>;

export const quizLiveSchema = z.object({
  quizId: z.number(),
  title: z.string(),
  timeLimitMinutes: z.number().nullable(),
  /** The server's clock, so the screen's countdown never trusts the phone's. */
  serverNow: z.string(),
  rows: z.array(quizLiveRowSchema),
});
export type QuizLive = z.infer<typeof quizLiveSchema>;
