import { z } from "zod";

import { quizKindSchema, quizQuestionTypeSchema } from "../enums";

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
  .refine((d) => d.type === "ESSAY" || (d.correctIndex !== null && d.correctIndex < d.options.length), {
    path: ["correctIndex"],
    message: "Mark the correct answer.",
  })
  .transform((d) => (d.type === "ESSAY" ? { ...d, options: [] as string[], correctIndex: null } : d));
/** What a client form sends (before the schema's defaults and transform run). */
export type QuizQuestionInput = z.input<typeof quizQuestionRequestSchema>;

/** New in v2 (R20: v1 had no reorder at all). Must be a permutation — checked server-side. */
export const reorderQuestionsRequestSchema = z.object({
  questionIds: z.array(z.number().int().positive()).min(1),
});

export const publishQuizRequestSchema = z.object({ publish: z.boolean() });

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

/** One answer as the app sends it (after defaults: both fields present). */
export type QuizAnswerInput = z.output<typeof saveQuizAnswersRequestSchema>["answers"][number];

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

export type QuizGradeEntry = z.output<typeof saveQuizGradesRequestSchema>["entries"][number];

/**
 * Every ESSAY question of the quiz must appear. v1 recomputed manualScore from
 * only the awards present in the call, so a partial payload silently lowered a
 * student's total (R72); completeness is checked server-side against the quiz.
 */
export const gradeEssayAnswersRequestSchema = z.object({
  awards: z.array(z.object({ questionId: z.number().int().positive(), points: z.number().int().min(0) })).min(1),
});

export const reopenAttemptRequestSchema = z.object({
  studentUserId: z.number().int().positive(),
});

export const quizListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
  sessionId: z.coerce.number().int().positive().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const quizAttemptsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
