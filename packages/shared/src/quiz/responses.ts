import { z } from "zod";

import { quizAttemptStatusSchema } from "../enums";
import { quizQuestionAuthoringSchema } from "./questions";

// ---------------------------------------------------------------------------
// Write responses — every client mutation parses one of these (ruling X10).
// ---------------------------------------------------------------------------

/** POST /quizzes */
export const quizCreatedResponseSchema = z.object({ id: z.number() });
/** PATCH /quizzes/:id */
export const quizUpdatedResponseSchema = z.object({ updated: z.literal(true) });
/** DELETE /quizzes/:id/questions/:questionId */
export const quizQuestionDeletedResponseSchema = z.object({ deleted: z.literal(true) });
/** PUT /quizzes/:id/questions/order */
export const reorderQuestionsResponseSchema = z.object({
  questions: z.array(quizQuestionAuthoringSchema),
});
/** POST /quizzes/:id/publish */
export const publishQuizResponseSchema = z.object({ publishedAt: z.string().nullable() });
/** POST /quizzes/:id/release */
export const releaseQuizResultsResponseSchema = z.object({ answersReleasedAt: z.string() });
/** PATCH /quizzes/:id/attempt */
export const saveQuizAnswersResponseSchema = z.object({ saved: z.number() });
/** POST /quizzes/:id/attempts/reopen */
export const reopenAttemptResponseSchema = z.object({
  attemptId: z.number(),
  attemptNumber: z.number(),
});
/** POST /quizzes/:id/attempts/end */
export const endAttemptResponseSchema = z.object({
  attemptId: z.number(),
  status: quizAttemptStatusSchema,
});
/**
 * POST /quizzes/:id/attempt/events. `exits` is the server's count, for the app's own logic only
 * (the warning never shows a number); `ended` is true only when THIS report closed the attempt.
 */
export const quizAttemptEventsResponseSchema = z.object({
  exits: z.number().int(),
  ended: z.boolean(),
  status: quizAttemptStatusSchema,
});
