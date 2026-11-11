import { z } from "zod";

import { idCursorSchema } from "../pagination";

import { quizKindSchema } from "../enums";

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
    shuffleQuestions: z.boolean().optional(),
    /** The window in which students may START the quiz; null clears an end of it. */
    startsFrom: z.iso.datetime().nullable().optional(),
    startsUntil: z.iso.datetime().nullable().optional(),
    /** Minutes each student gets once they open the attempt; null = untimed. */
    timeLimitMinutes: z.number().int().min(1).max(300).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." })
  .refine((v) => !v.startsFrom || !v.startsUntil || Date.parse(v.startsFrom) < Date.parse(v.startsUntil), {
    path: ["startsUntil"],
    message: "The quiz must stop being startable after it can first be started.",
  });

/** POST /quizzes/:id/attempts/end: staff end a student's open attempt. */
export const endAttemptRequestSchema = z.object({ studentUserId: z.number().int().positive() });

/** New in v2 (R20: v1 had no reorder at all). Must be a permutation — checked server-side. */
export const reorderQuestionsRequestSchema = z.object({
  questionIds: z.array(z.number().int().positive()).min(1),
});

export const publishQuizRequestSchema = z.object({ publish: z.boolean() });

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
 * Right or wrong for every leader-marked item of an attempt: one mark per FILL_BLANK
 * blank (`blankId`) and one per ESSAY question (`blankId: null`). Completeness is
 * checked server-side against the attempt, since a partial payload would otherwise
 * silently lower a student's total (R72). Replaces the old essay point awards.
 */
export const markAttemptRequestSchema = z
  .object({
    marks: z
      .array(
        z
          .object({
            questionId: z.number().int().positive(),
            blankId: z.number().int().positive().nullable(),
            correct: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export type MarkAttemptInput = z.output<typeof markAttemptRequestSchema>;

export const reopenAttemptRequestSchema = z.object({
  studentUserId: z.number().int().positive(),
});

export const quizListQuerySchema = z.object({
  seasonId: z.coerce.number().int().positive().optional(),
  sessionId: z.coerce.number().int().positive().optional(),
  cursor: idCursorSchema,
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const quizAttemptsQuerySchema = z.object({
  cursor: idCursorSchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * POST /quizzes/:id/attempt/events — what the phone saw while the attempt was open. Each event
 * carries the phone's own id, so a retry or an offline replay is stored once. EXIT and RELAUNCH
 * count towards MAX_EXITS; SCREENSHOT is logged only.
 */
const quizAttemptEventInputSchema = z
  .object({
    clientEventId: z.uuid(),
    kind: z.enum(["EXIT", "RELAUNCH", "SCREENSHOT"]),
    leftAt: z.iso.datetime({ offset: true }),
    returnedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine((e) => e.returnedAt === null || Date.parse(e.returnedAt) >= Date.parse(e.leftAt), {
    path: ["returnedAt"],
    message: "The student can't come back before they left.",
  });
export type QuizAttemptEventInput = z.output<typeof quizAttemptEventInputSchema>;

/** `attemptId` is the attempt the phone saw (the student detail's): events for an older attempt are dropped. */
export const quizAttemptEventsRequestSchema = z
  .object({
    attemptId: z.number().int().positive(),
    events: z.array(quizAttemptEventInputSchema).min(1).max(20),
  })
  .strict();
