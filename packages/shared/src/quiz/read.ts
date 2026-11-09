import { z } from "zod";

import { quizAttemptStatusSchema, quizKindSchema, quizQuestionTypeSchema } from "../enums";

// ---------------------------------------------------------------------------
// Read shapes
// ---------------------------------------------------------------------------

/**
 * A staff list row.
 *
 * `gradedCount` and `studentCount` are computed once, server-side, against ONE
 * defined student set (ruling C4; spec R98/R110/R114, where three different
 * "graded" numbers and three different "students in this season" coexisted and
 * every ONLINE quiz read as permanently pending). Definitions, fixed here:
 * `studentCount` is the ACTIVE SeasonEnrollment population of the quiz's season
 * narrowed to the caller's scope; `gradedCount` is QuizGrade rows with a
 * non-null score for PAPER, and QuizAttempt rows with status GRADED for ONLINE.
 */
const quizSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  publishedAt: z.string().nullable(),
  questionCount: z.number(),
  maxScore: z.number(),
  sessionId: z.number().nullable(),
  sessionTitle: z.string().nullable(),
  sessionDate: z.string().nullable(),
  seasonId: z.number(),
  seasonCode: z.string(),
  gradedCount: z.number(),
  studentCount: z.number(),
  /** When students were let see their scores; null while results are held back. */
  resultsReleasedAt: z.string().nullable(),
});
export type QuizSummary = z.infer<typeof quizSummarySchema>;

export const quizListPageSchema = z.object({
  items: z.array(quizSummarySchema),
  nextCursor: z.number().nullable(),
});
export type QuizListPage = z.infer<typeof quizListPageSchema>;

/** Authoring projection — the ONLY read shape carrying the answer key. */
export const quizQuestionAuthoringSchema = z.object({
  id: z.number(),
  order: z.number(),
  type: quizQuestionTypeSchema,
  prompt: z.string(),
  points: z.number(),
  options: z.array(z.string()),
  correctIndex: z.number().nullable(),
});
export type QuizQuestionAuthoring = z.infer<typeof quizQuestionAuthoringSchema>;

export const quizAuthoringDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  seasonId: z.number(),
  seasonCode: z.string(),
  sessionId: z.number().nullable(),
  sessionTitle: z.string().nullable(),
  publishedAt: z.string().nullable(),
  maxScore: z.number(),
  attemptCount: z.number(),
  gradeCount: z.number(),
  /**
   * Derived server-side (C4): false once any attempt exists, which is what
   * makes questions immutable at that point (spec D3). The screen reads this
   * rather than re-deriving "does it have attempts" from a count it happens
   * to have — the server's answer is the one the write path enforces.
   */
  canEditStructure: z.boolean(),
  /** Whether this caller may reopen an attempt / publish (canManageQuiz). */
  canManage: z.boolean(),
  /**
   * Students see no score and no right or wrong answer until this is set
   * (owner, 2026-11-07): someone taking the quiz later could learn the answers
   * from someone who took it first.
   */
  resultsReleasedAt: z.string().nullable(),
  /** The season's admin, or a super: the only people who may release results. */
  canReleaseResults: z.boolean(),
  questions: z.array(quizQuestionAuthoringSchema),
});
export type QuizAuthoringDetail = z.infer<typeof quizAuthoringDetailSchema>;

/**
 * The student projection. No `correctIndex`, ever.
 *
 * `isCorrect` and `pointsAwarded` ARE here and are correct to send (R34): both
 * are null until submit, and after an auto-graded submit the student learns
 * which MCQs were wrong without learning what was right.
 */
export const quizQuestionStudentSchema = z.object({
  id: z.number(),
  order: z.number(),
  type: quizQuestionTypeSchema,
  prompt: z.string(),
  points: z.number(),
  options: z.array(z.string()),
  selectedIndex: z.number().nullable(),
  text: z.string().nullable(),
  isCorrect: z.boolean().nullable(),
  pointsAwarded: z.number().nullable(),
});
export type QuizQuestionStudent = z.infer<typeof quizQuestionStudentSchema>;

/**
 * `autoScore` and `manualScore` are deliberately absent: v1 returned both to
 * the student and rendered neither (spec §5). `totalScore` is the only score a
 * student is ever shown.
 */
export const studentQuizDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  seasonId: z.number(),
  maxScore: z.number(),
  sessionTitle: z.string().nullable(),
  attemptId: z.number().nullable(),
  attemptNumber: z.number(),
  status: quizAttemptStatusSchema.nullable(),
  totalScore: z.number().nullable(),
  submittedAt: z.string().nullable(),
  gradedAt: z.string().nullable(),
  questions: z.array(quizQuestionStudentSchema),
  /** True when the student's enrolment is no longer ACTIVE: they can read the quiz, not take it. */
  readOnly: z.boolean(),
  /**
   * False until staff release the results. Until then a handed-in attempt
   * reads SUBMITTED, and the score, gradedAt and every isCorrect and
   * pointsAwarded are null.
   */
  resultsReleased: z.boolean(),
});
export type StudentQuizDetail = z.infer<typeof studentQuizDetailSchema>;

/** One row of the student's results list. */
const studentQuizResultSchema = z.object({
  quizId: z.number(),
  title: z.string(),
  kind: quizKindSchema,
  maxScore: z.number(),
  score: z.number().nullable(),
  notes: z.string().nullable(),
  gradedAt: z.string().nullable(),
  sessionTitle: z.string().nullable(),
  sessionDate: z.string().nullable(),
  /** ONLINE only; null for PAPER and for a never-started ONLINE quiz. */
  attemptStatus: quizAttemptStatusSchema.nullable(),
  /** False until staff release the results: no score, and a graded attempt reads SUBMITTED. */
  resultsReleased: z.boolean(),
});
export type StudentQuizResult = z.infer<typeof studentQuizResultSchema>;

export const studentQuizListPageSchema = z.object({
  items: z.array(studentQuizResultSchema),
  nextCursor: z.null(),
});
