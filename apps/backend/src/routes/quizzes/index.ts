import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { listAttempts, gradeAttempt, reopenAttempt } from "./grading";
import { createQuiz, updateQuiz } from "./authoring";
import { endAttempt } from "./end-attempt";
import { getQuiz } from "./detail";
import { listQuizzes } from "./list";
import { getGradeSheet, saveGrades } from "./paper-grades";
import { addQuestion, deleteQuestion, publishQuiz, reorderQuestions, updateQuestion } from "./questions";
import { saveAttemptAnswers, startAttempt, submitAttempt } from "./attempts";
import { getQuizLive } from "./live";
import { postAttemptEvents } from "./attempt-events";
import { releaseQuizResults } from "./release";

/**
 * Domain 12 — text quizzes. The handlers live beside this file by concern
 * (authoring, questions, list, detail, the student's attempt, grading, paper
 * grades); this is the route table, in registration order.
 */
export const quizzesRouter = Router();

quizzesRouter.use(requireAuth);

// Authoring: the quiz row itself.
quizzesRouter.post("/", createQuiz);
quizzesRouter.patch("/:id", updateQuiz);
quizzesRouter.get("/", listQuizzes);

// Authoring: questions (structurally frozen once attempts exist) and publishing.
quizzesRouter.post("/:id/questions", addQuestion);
quizzesRouter.patch("/:id/questions/:questionId", updateQuestion);
quizzesRouter.delete("/:id/questions/:questionId", deleteQuestion);
quizzesRouter.put("/:id/questions/order", reorderQuestions);
quizzesRouter.post("/:id/publish", publishQuiz);
// Students see scores only once the season's admin or a super releases them.
quizzesRouter.post("/:id/release", releaseQuizResults);

// Staff: where every student in scope is right now (before the bare /:id).
quizzesRouter.get("/:id/live", getQuizLive);

quizzesRouter.get("/:id", getQuiz);

// The student's own attempt, addressed by quiz — never by attempt id.
quizzesRouter.put("/:id/attempt", startAttempt);
quizzesRouter.patch("/:id/attempt", saveAttemptAnswers);
quizzesRouter.post("/:id/attempt/submit", submitAttempt);
// What the phone saw while the attempt was open; the third exit ends it.
quizzesRouter.post("/:id/attempt/events", postAttemptEvents);

// Staff grading of ONLINE attempts.
quizzesRouter.get("/:id/attempts", listAttempts);
quizzesRouter.post("/:id/attempts/:attemptId/grade", gradeAttempt);
quizzesRouter.post("/:id/attempts/reopen", reopenAttempt);
quizzesRouter.post("/:id/attempts/end", endAttempt);

// PAPER grade sheet.
quizzesRouter.get("/:id/grades", getGradeSheet);
quizzesRouter.post("/:id/grades", saveGrades);
