import { Router } from "express";

/**
 * Domain 13. Mounted at /api/v1 rather than under a single prefix because the
 * surface spans two parents: the student and authoring reads hang off a
 * session (`/sessions/:id/video-*`) while update and delete address a question
 * directly (`/video-questions/:questionId`).
 *
 * Because the prefix is shared, `requireAuth` is attached to each route, never
 * with `videoQuizRouter.use(...)` (ruling X5): a router-wide guard here would
 * answer 401 for every unknown /api/v1 path and re-run auth for every router
 * mounted after it.
 *
 * Nothing here belongs to domain 12. Text quizzes own Quiz/QuizQuestion/
 * QuizAttempt/QuizAnswer/QuizGrade; this owns SessionVideoQuestion/
 * SessionVideoQuestionResponse/SessionVideoProgress. They share no table.
 */
export const videoQuizRouter = Router();
