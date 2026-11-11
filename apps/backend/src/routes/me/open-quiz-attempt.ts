import { Router } from "express";

import { apiOk } from "../../lib/api-response";
import { openQuizAttemptFor } from "../../lib/quizzes/open-attempt";
import { requireAuth, requireUser } from "../../middleware/require-auth";

/** The relaunch lock's read, mounted under /api/v1/me. */
export const meOpenQuizAttemptRouter = Router();

/**
 * The quiz the student must be kept on (spec "Relaunch"). Staff are never held on a quiz, so they
 * get null rather than a 403: the app asks only for students, and null is the true answer anyway.
 */
meOpenQuizAttemptRouter.get("/open-quiz-attempt", requireAuth, async (req, res) => {
  const user = requireUser(req);
  const quizId = user.role === "STUDENT" ? await openQuizAttemptFor(user.userId) : null;
  return apiOk(res, { quizId });
});
