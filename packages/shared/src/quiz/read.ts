import { z } from "zod";

import { quizAttemptEndReasonSchema, quizAttemptStatusSchema, quizKindSchema } from "../enums";
import { quizQuestionAuthoringSchema } from "./questions";
import { quizQuestionStudentSchema } from "./student";

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
  /** When students were let see the answers; null while they are held back. */
  answersReleasedAt: z.string().nullable(),
});
export type QuizSummary = z.infer<typeof quizSummarySchema>;

export const quizListPageSchema = z.object({
  items: z.array(quizSummarySchema),
  nextCursor: z.number().nullable(),
});
export type QuizListPage = z.infer<typeof quizListPageSchema>;

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
   * Students see no question text and no right or wrong answer until this is
   * set: someone taking the quiz later could learn the answers from someone
   * who took it first. Their score does not wait for it.
   */
  answersReleasedAt: z.string().nullable(),
  /** The season's admin, or a super: the only people who may release the answers. */
  canReleaseResults: z.boolean(),
  /** Whether each attempt's questions are shuffled for the student (on by default). */
  shuffleQuestions: z.boolean(),
  /** Start window (ISO) and per-student time limit; null = not set. */
  startsFrom: z.string().nullable(),
  startsUntil: z.string().nullable(),
  timeLimitMinutes: z.number().nullable(),
  questions: z.array(quizQuestionAuthoringSchema),
});
export type QuizAuthoringDetail = z.infer<typeof quizAuthoringDetailSchema>;

/**
 * The season admin's score for this student on an ONLINE quiz (plan 4), as the student sees it,
 * labelled "Score entered by your admin". When set it is the score that counts (`totalScore` /
 * `score` carry it too), and it shows at once with its note, no release needed.
 */
// `.default(null)`: an app build talking to a backend from before plan 4 reads "none".
const studentAdminScoreSchema = z.object({ score: z.number(), notes: z.string().nullable() }).nullable().default(null);

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
  /** Which screen the student is on: before, during, waiting for marking, score only, or answers shown. */
  stage: z.enum(["not_started", "in_progress", "submitted", "graded", "answers"]),
  /** The score that counts: the admin's score when there is one, else the best GRADED attempt; null until either. */
  totalScore: z.number().nullable(),
  /** The admin's score and note; null when none. Never moves the student to `answers` on its own. */
  adminScore: studentAdminScoreSchema,
  submittedAt: z.string().nullable(),
  gradedAt: z.string().nullable(),
  /**
   * How many questions the quiz has, at every stage. A count is not the key,
   * and `questions` is empty before the start, so the start card reads this.
   */
  questionCount: z.number(),
  questions: z.array(quizQuestionStudentSchema),
  /** True when the student's enrolment is no longer ACTIVE: they can read the quiz, not take it. */
  readOnly: z.boolean(),
  /**
   * False until staff release the answers. Until then `questions` is empty
   * after a hand-in and no `review` is sent.
   */
  answersReleased: z.boolean(),
  /** Start window (ISO) and per-student time limit; null = not set. */
  startsFrom: z.string().nullable(),
  startsUntil: z.string().nullable(),
  timeLimitMinutes: z.number().nullable(),
  /**
   * When the open attempt runs out (ISO); null when untimed or not started. On a timed quiz
   * (`timeLimitMinutes` set), stage `in_progress` with `deadlineAt` null means NOT STARTED yet
   * (a reopened attempt): save and submit refuse `attempt_not_started` until the start PUT,
   * which sets the deadline. The app shows a start card for that state.
   */
  deadlineAt: z.string().nullable(),
  /** The server's clock at this response: the countdown's reference, not the phone's. */
  serverNow: z.string(),
  endReason: quizAttemptEndReasonSchema.nullable(),
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
  /** False until staff release the answers. */
  answersReleased: z.boolean(),
  /** ONLINE only: the admin's score and note, which `score` then carries; null for PAPER and when none. */
  adminScore: studentAdminScoreSchema,
});
export type StudentQuizResult = z.infer<typeof studentQuizResultSchema>;

export const studentQuizListPageSchema = z.object({
  items: z.array(studentQuizResultSchema),
  nextCursor: z.null(),
});
