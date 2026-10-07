import { z } from "zod";

import { MAX_VIDEO_SECONDS } from "./video-time";

// Wire shapes — see the note in season.ts on why timestamps are strings.
//
// Domain 13 is NOT domain 12. `Quiz`/`QuizQuestion`/`QuizAttempt`/`QuizAnswer`
// and `SessionVideoQuestion`/`SessionVideoQuestionResponse`/
// `SessionVideoProgress` share no table, no column and no FK — verified against
// prisma/schema.prisma. Nothing here may be unified with quiz.ts.

/** Authoring input. Mirrors v1's `questionSchema` bounds exactly. */
export const videoQuestionInputSchema = z
  .object({
    atSeconds: z.number().int().min(0).max(MAX_VIDEO_SECONDS),
    prompt: z.string().trim().min(2).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    points: z.number().int().min(1).max(100).default(1),
  })
  .refine((d) => d.correctIndex < d.options.length, {
    message: "Correct answer must be one of the options.",
    path: ["correctIndex"],
  });
export type VideoQuestionInput = z.output<typeof videoQuestionInputSchema>;

/**
 * The admin half of the answer-key split. Carries `correctIndex`; must never be
 * the parse target of a student-facing hook.
 */
export const videoQuestionAdminSchema = z.object({
  id: z.number(),
  atSeconds: z.number(),
  prompt: z.string(),
  options: z.array(z.string()),
  correctIndex: z.number(),
  points: z.number(),
  responseCount: z.number(),
});
export type VideoQuestionAdmin = z.infer<typeof videoQuestionAdminSchema>;

/**
 * The student half of the answer-key split.
 *
 * There is no `correctIndex` field, and `.strict()` means there can never be
 * one: a backend that starts selecting it fails this parse instead of rendering
 * the answer to the question the student is being asked. This absence is the
 * enforcement of v1's R69 — the one place v1 got exposure right by
 * construction, and the behaviour v2 must preserve.
 */
export const studentVideoQuestionSchema = z
  .object({
    id: z.number(),
    atSeconds: z.number(),
    prompt: z.string(),
    options: z.array(z.string()),
    points: z.number(),
    answered: z.boolean(),
    selectedIndex: z.number().nullable(),
    isCorrect: z.boolean().nullable(),
  })
  .strict();
export type StudentVideoQuestion = z.infer<typeof studentVideoQuestionSchema>;

export const studentVideoQuizSchema = z.object({
  /**
   * Resolved server-side from `Session.youtubeUrl` so the client never
   * re-implements the parser (spec 13 §7). Null means the URL is missing or
   * unparseable — the screen falls back to a "watch on YouTube" link, which is
   * the only honest thing it can do.
   */
  videoId: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  questions: z.array(studentVideoQuestionSchema),
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
  earnedPoints: z.number(),
  totalPoints: z.number(),
  answeredCount: z.number(),
  /**
   * The id of the question the server will accept an answer for next, or null
   * when every question is answered. Derived once here (ruling C4) — the client
   * renders the barrier from this rather than recomputing "smallest atSeconds
   * among unanswered", which is exactly the derivation v1 kept only in the
   * player component.
   */
  nextQuestionId: z.number().nullable(),
});
export type StudentVideoQuiz = z.infer<typeof studentVideoQuizSchema>;

export const submitVideoAnswerRequestSchema = z.object({
  questionId: z.number().int().positive(),
  /** Upper bound is row-dependent (it is `options.length`), so it stays a server check. */
  selectedIndex: z.number().int().min(0),
});
export type SubmitVideoAnswerRequest = z.infer<typeof submitVideoAnswerRequestSchema>;

export const submitVideoAnswerResponseSchema = z.object({
  isCorrect: z.boolean(),
  /**
   * Returned for the question just answered, and only then. Safe because one
   * answer per question is final (v1 R54), and it is the feedback the modal
   * exists to show.
   */
  correctIndex: z.number(),
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
  nextQuestionId: z.number().nullable(),
});
export type SubmitVideoAnswerResponse = z.infer<typeof submitVideoAnswerResponseSchema>;

/**
 * No `completed` field. v1 accepted it as a client claim, so a single call with
 * `(sessionId, 0, true)` marked a student complete (R48) while a student who
 * answered the last question and closed the app was never marked at all (R65).
 * The server knows the question set and the responses; it derives completion.
 */
export const videoProgressRequestSchema = z.object({
  furthestSeconds: z.number().int().min(0).max(MAX_VIDEO_SECONDS),
});
export type VideoProgressRequest = z.infer<typeof videoProgressRequestSchema>;

export const videoProgressResponseSchema = z.object({
  furthestSeconds: z.number(),
  completedAt: z.string().nullable(),
});

/** New capability — v1 shows no student's video-quiz result to anybody (R74). */
export const videoQuizResultRowSchema = z.object({
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  groupId: z.number().nullable(),
  groupName: z.string().nullable(),
  answeredCount: z.number(),
  questionCount: z.number(),
  earnedPoints: z.number(),
  totalPoints: z.number(),
  completedAt: z.string().nullable(),
});
export type VideoQuizResultRow = z.infer<typeof videoQuizResultRowSchema>;

export const videoQuizResultsSchema = z.object({
  questionCount: z.number(),
  totalPoints: z.number(),
  rows: z.array(videoQuizResultRowSchema),
});
export type VideoQuizResults = z.infer<typeof videoQuizResultsSchema>;

// Write responses — the mobile hooks parse these rather than casting (X10).

export const createVideoQuestionResponseSchema = z.object({
  question: videoQuestionAdminSchema,
});

export const updateVideoQuestionResponseSchema = z.object({
  question: videoQuestionAdminSchema,
  /** How many recorded answers flipped verdict under the new key (spec 13 D5). */
  regradedCount: z.number().int().min(0),
  pointsChanged: z.boolean(),
});
export type UpdateVideoQuestionResponse = z.infer<typeof updateVideoQuestionResponseSchema>;

export const deleteVideoQuestionResponseSchema = z.object({
  deleted: z.literal(true),
  responsesRemoved: z.number().int().min(0),
});
export type DeleteVideoQuestionResponse = z.infer<typeof deleteVideoQuestionResponseSchema>;
