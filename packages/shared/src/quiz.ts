import { z } from "zod";

import { quizAttemptStatusSchema, quizKindSchema, quizQuestionTypeSchema } from "./enums";

// Wire shapes — timestamps are ISO strings, per the note in season.ts.
//
// THE CENTRAL DECISION OF THIS DOMAIN (spec §8, D2): there is no schema
// anywhere in this file with an optional `correctIndex`. The presence of the
// answer key is a DIFFERENT TYPE, so a client parsing the student shape can
// never be handed the key as a typed field. On the server, the raw-JSON
// integration test in the attempts task is the guarantee; the typed
// `toStudentQuestion` mapper there catches the most likely edit (a
// `correctIndex` line added to its literal) at typecheck, but structural
// typing lets a spread through, so the test is what must never be weakened.
// v1's protection was a `select` list living in the same file as the two
// reads that do return the key.

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
export const quizSummarySchema = z.object({
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
});
export type StudentQuizDetail = z.infer<typeof studentQuizDetailSchema>;

/** One row of the student's results list. */
export const studentQuizResultSchema = z.object({
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
});
export type StudentQuizResult = z.infer<typeof studentQuizResultSchema>;

export const studentQuizListPageSchema = z.object({
  items: z.array(studentQuizResultSchema),
  nextCursor: z.null(),
});
export type StudentQuizListPage = z.infer<typeof studentQuizListPageSchema>;

export const quizGradeRowSchema = z.object({
  studentUserId: z.number(),
  studentName: z.string().nullable(),
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
export const quizGradingAnswerSchema = z.object({
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

// ---------------------------------------------------------------------------
// Write shapes
// ---------------------------------------------------------------------------

export const createQuizRequestSchema = z
  .object({
    /**
     * In the body, not the path. Quiz routes all live in one file mounted at
     * /api/v1/quizzes, so creation cannot hang off /seasons/:id — the same
     * recorded deviation Plan 3 made for POST /api/v1/sessions.
     */
    seasonId: z.number().int().positive(),
    /** Nullable: the column is (schema.prisma:648) and D12 recommends allowing it. */
    sessionId: z.number().int().positive().nullable().default(null),
    title: z.string().trim().min(1).max(200),
    kind: quizKindSchema,
    maxScore: z.number().int().min(1).max(1000).optional(),
  })
  .refine((v) => v.kind !== "PAPER" || v.maxScore !== undefined, {
    path: ["maxScore"],
    message: "Max score is required for paper quizzes.",
  })
  // R4 zeroed a caller's maxScore silently for ONLINE. Refusing is honest: an
  // ONLINE quiz's maxScore is the sum of its question points and nothing else.
  .refine((v) => v.kind !== "ONLINE" || v.maxScore === undefined, {
    path: ["maxScore"],
    message: "An online quiz derives its max score from its questions.",
  });
export type CreateQuizBody = z.output<typeof createQuizRequestSchema>;

/**
 * `kind` is absent by design: v1 writes it once at create and never again, and
 * a kind change would reinterpret every existing grade or attempt.
 */
export const updateQuizRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    maxScore: z.number().int().min(1).max(1000).optional(),
    sessionId: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });
export type UpdateQuizBody = z.output<typeof updateQuizRequestSchema>;

/**
 * v1 validated, then normalised in a separate `normalizeQuestion` helper that
 * every write had to remember to call. The normalisation is a `transform` here
 * so it cannot be forgotten (spec §8).
 */
export const quizQuestionRequestSchema = z
  .object({
    type: quizQuestionTypeSchema,
    prompt: z.string().trim().min(2).max(2000),
    points: z.number().int().min(1).max(100),
    options: z.array(z.string().trim().min(1).max(500)).max(6).default([]),
    correctIndex: z.number().int().min(0).nullable().default(null),
  })
  .refine((d) => d.type === "ESSAY" || d.options.length >= 2, {
    path: ["options"],
    message: "Add at least 2 options.",
  })
  .refine(
    (d) => d.type === "ESSAY" || (d.correctIndex !== null && d.correctIndex < d.options.length),
    { path: ["correctIndex"], message: "Mark the correct answer." },
  )
  .transform((d) =>
    d.type === "ESSAY" ? { ...d, options: [] as string[], correctIndex: null } : d,
  );
export type QuizQuestionBody = z.output<typeof quizQuestionRequestSchema>;
/** What a client form sends (before the schema's defaults and transform run). */
export type QuizQuestionInput = z.input<typeof quizQuestionRequestSchema>;

/** New in v2 (R20: v1 had no reorder at all). Must be a permutation — checked server-side. */
export const reorderQuestionsRequestSchema = z.object({
  questionIds: z.array(z.number().int().positive()).min(1),
});
export type ReorderQuestionsBody = z.infer<typeof reorderQuestionsRequestSchema>;

export const publishQuizRequestSchema = z.object({ publish: z.boolean() });
export type PublishQuizBody = z.infer<typeof publishQuizRequestSchema>;

/**
 * A batch, unlike v1's one-answer-per-call. The runner debounces and flushes
 * everything pending in one request, so a backgrounded phone loses at most one
 * flush instead of one answer per silent failure (R55/R56 and spec §9).
 */
export const saveQuizAnswersRequestSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        /** Bounds against THIS question's options.length are a server check (R51). */
        selectedIndex: z.number().int().min(0).nullable().default(null),
        text: z.string().max(20000).nullable().default(null),
      }),
    )
    .min(1)
    .max(100),
});
export type SaveQuizAnswersBody = z.output<typeof saveQuizAnswersRequestSchema>;

/**
 * `score: null` CLEARS the grade row.
 *
 * v1 skipped null entries entirely (R89), so a grade entered against the wrong
 * student could never be removed. Spec D7 recommends a separate
 * DELETE /quizzes/:id/grades/:studentUserId; this plan folds it into the batch
 * instead, because the client is a grid that submits the whole sheet and a
 * separate endpoint would mean one extra round trip per cleared cell. The
 * upper bound against the quiz's own maxScore is a server check (R88/D7).
 */
export const saveQuizGradesRequestSchema = z.object({
  entries: z
    .array(
      z.object({
        studentUserId: z.number().int().positive(),
        score: z.number().int().min(0).nullable(),
        notes: z.string().max(1000).nullable().default(null),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveQuizGradesBody = z.output<typeof saveQuizGradesRequestSchema>;

/**
 * Every ESSAY question of the quiz must appear. v1 recomputed manualScore from
 * only the awards present in the call, so a partial payload silently lowered a
 * student's total (R72); completeness is checked server-side against the quiz.
 */
export const gradeEssayAnswersRequestSchema = z.object({
  awards: z
    .array(z.object({ questionId: z.number().int().positive(), points: z.number().int().min(0) }))
    .min(1),
});
export type GradeEssayAnswersBody = z.infer<typeof gradeEssayAnswersRequestSchema>;

export const reopenAttemptRequestSchema = z.object({
  studentUserId: z.number().int().positive(),
});
export type ReopenAttemptBody = z.infer<typeof reopenAttemptRequestSchema>;

export const quizListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
  sessionId: z.coerce.number().int().positive().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type QuizListQuery = z.infer<typeof quizListQuerySchema>;

export const quizAttemptsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type QuizAttemptsQuery = z.infer<typeof quizAttemptsQuerySchema>;

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
/** PATCH /quizzes/:id/attempt */
export const saveQuizAnswersResponseSchema = z.object({ saved: z.number() });
/** POST /quizzes/:id/attempts/reopen */
export const reopenAttemptResponseSchema = z.object({
  attemptId: z.number(),
  attemptNumber: z.number(),
});
