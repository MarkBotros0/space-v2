import { z } from "zod";

import { quizAttemptStatusSchema, quizKindSchema, quizQuestionTypeSchema } from "../enums";

// ---------------------------------------------------------------------------
// Grading read shapes — the paper grade sheet and the online grading page.
// ---------------------------------------------------------------------------

const quizGradeRowSchema = z.object({
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  /** The student's group in the quiz's season, for listing by group (owner, 2026-11-07). */
  groupName: z.string().nullable(),
  score: z.number().nullable(),
  notes: z.string().nullable(),
  gradedAt: z.string().nullable(),
  /** D13: the audit column v1 wrote and never read. One join, real information. */
  gradedByName: z.string().nullable(),
});
export type QuizGradeRow = z.infer<typeof quizGradeRowSchema>;

export const quizGradeSheetSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  maxScore: z.number(),
  seasonId: z.number(),
  sessionTitle: z.string().nullable(),
  studentCount: z.number(),
  rows: z.array(quizGradeRowSchema),
});
export type QuizGradeSheet = z.infer<typeof quizGradeSheetSchema>;

/** Grader-only: carries the answer key by design (R103). */
const quizGradingAnswerSchema = z.object({
  questionId: z.number(),
  type: quizQuestionTypeSchema,
  prompt: z.string(),
  points: z.number(),
  options: z.array(z.string()),
  correctIndex: z.number().nullable(),
  selectedIndex: z.number().nullable(),
  isCorrect: z.boolean().nullable(),
  text: z.string().nullable(),
  pointsAwarded: z.number().nullable(),
});
export type QuizGradingAnswer = z.infer<typeof quizGradingAnswerSchema>;

export const quizGradingAttemptSchema = z.object({
  attemptId: z.number(),
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  attemptNumber: z.number(),
  status: quizAttemptStatusSchema,
  autoScore: z.number().nullable(),
  manualScore: z.number().nullable(),
  totalScore: z.number().nullable(),
  submittedAt: z.string().nullable(),
  gradedByName: z.string().nullable(),
  answers: z.array(quizGradingAnswerSchema),
});
export type QuizGradingAttempt = z.infer<typeof quizGradingAttemptSchema>;

export const quizGradingPageSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  maxScore: z.number(),
  hasEssays: z.boolean(),
  studentCount: z.number(),
  /**
   * Students in scope with no attempt at all, and students whose latest attempt
   * is still IN_PROGRESS, both appear — the second is spec D5/R102, where a
   * student vanished from the grading list entirely (including one an admin
   * had just reopened) because the read filtered to SUBMITTED|GRADED.
   */
  items: z.array(quizGradingAttemptSchema),
  waiting: z.array(
    z.object({
      studentUserId: z.number(),
      studentName: z.string().nullable(),
      /** null = never started; a date = an IN_PROGRESS attempt open since then. */
      startedAt: z.string().nullable(),
    }),
  ),
  nextCursor: z.number().nullable(),
});
export type QuizGradingPage = z.infer<typeof quizGradingPageSchema>;
