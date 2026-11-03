import { Router } from "express";

// requireAuth is passed to every route individually — this router shares the
// /api/v1 prefix (ruling X5).
import { requireAuth } from "../../middleware/require-auth";
import {
  createVideoQuestion,
  deleteVideoQuestion,
  getVideoQuizResults,
  listVideoQuestions,
  updateVideoQuestion,
} from "./staff";
import { answerVideoQuestion, getVideoQuiz, saveVideoProgress } from "./student";

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
 *
 * This file is the route table, in registration order; the student's routes
 * live in ./student.ts and the staff (authoring and results) routes in ./staff.ts.
 */
export const videoQuizRouter = Router();

videoQuizRouter.get("/sessions/:id/video-quiz", requireAuth, getVideoQuiz);
videoQuizRouter.post("/sessions/:id/video-quiz/answers", requireAuth, answerVideoQuestion);
videoQuizRouter.put("/sessions/:id/video-quiz/progress", requireAuth, saveVideoProgress);
videoQuizRouter.get("/sessions/:id/video-questions", requireAuth, listVideoQuestions);
videoQuizRouter.post("/sessions/:id/video-questions", requireAuth, createVideoQuestion);
videoQuizRouter.patch("/video-questions/:questionId", requireAuth, updateVideoQuestion);
videoQuizRouter.delete("/video-questions/:questionId", requireAuth, deleteVideoQuestion);
videoQuizRouter.get("/sessions/:id/video-quiz/results", requireAuth, getVideoQuizResults);
