import { z } from "zod";

import { quizAttemptEndReasonSchema, quizAttemptStatusSchema, quizKindSchema } from "../enums";

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

const gradingBase = {
  questionId: z.number(),
  prompt: z.string(),
  points: z.number(),
  pointsAwarded: z.number().nullable(),
};
const gradingOption = z.object({ id: z.number(), label: z.string(), isCorrect: z.boolean() }).strict();
const gradingPair = z.object({ leftId: z.number(), left: z.string(), rightId: z.number(), right: z.string() }).strict();

/**
 * Grader-only: carries the answer key by design (R103), in the author's order.
 * Per type: the key next to what the student chose. FILL_BLANK and ESSAY are
 * what the leader marks right or wrong (`correct` null = not marked yet).
 */
const quizGradingAnswerSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...gradingBase,
      type: z.enum(["SINGLE_CHOICE", "TRUE_FALSE"]),
      options: z.array(gradingOption),
      selectedOptionId: z.number().nullable(),
    })
    .strict(),
  z
    .object({
      ...gradingBase,
      type: z.literal("MULTI_CHOICE"),
      options: z.array(gradingOption),
      selectedOptionIds: z.array(z.number()),
    })
    .strict(),
  z
    .object({
      ...gradingBase,
      type: z.literal("MATCHING"),
      pairs: z.array(gradingPair),
      chosen: z.array(z.object({ leftId: z.number(), rightId: z.number() }).strict()),
    })
    .strict(),
  z
    .object({
      ...gradingBase,
      type: z.literal("FILL_BLANK"),
      blanks: z.array(
        z
          .object({
            blankId: z.number(),
            position: z.number(),
            expected: z.string(),
            text: z.string().nullable(),
            correct: z.boolean().nullable(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({ ...gradingBase, type: z.literal("ESSAY"), text: z.string().nullable(), correct: z.boolean().nullable() })
    .strict(),
]);
export type QuizGradingAnswer = z.infer<typeof quizGradingAnswerSchema>;

/** One logged event of an attempt for the exit log (staff only); `returnedAt` null = never reported back. */
const quizGradingEventSchema = z.object({
  kind: z.enum(["EXIT", "RELAUNCH", "SCREENSHOT"]),
  leftAt: z.string(),
  returnedAt: z.string().nullable(),
});
export type QuizGradingEvent = z.infer<typeof quizGradingEventSchema>;

/** How an attempt ended and who ended it (staff views); all null while it is open or legacy. */
const gradingEndShape = {
  endReason: quizAttemptEndReasonSchema.nullable(),
  /** Name of the staff member who ended it (ENDED_BY_STAFF); null otherwise. */
  endedByName: z.string().nullable(),
  deadlineAt: z.string().nullable(),
};

export const quizGradingAttemptSchema = z.object({
  attemptId: z.number(),
  studentUserId: z.number(),
  studentName: z.string().nullable(),
  attemptNumber: z.number(),
  status: quizAttemptStatusSchema,
  autoScore: z.number().nullable(),
  manualScore: z.number().nullable(),
  /** This attempt's total: the latest attempt, the one being marked. */
  totalScore: z.number().nullable(),
  /**
   * The student's best GRADED total across their attempts (spec "Honest
   * accidents"), the score the list shows; null until one is graded.
   */
  bestScore: z.number().nullable(),
  submittedAt: z.string().nullable(),
  gradedByName: z.string().nullable(),
  ...gradingEndShape,
  /** The exit log: every event the phone reported, oldest first. */
  events: z.array(quizGradingEventSchema),
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
      ...gradingEndShape,
    }),
  ),
  nextCursor: z.number().nullable(),
});
export type QuizGradingPage = z.infer<typeof quizGradingPageSchema>;
