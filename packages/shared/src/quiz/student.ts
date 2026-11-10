import { z } from "zod";

// ---------------------------------------------------------------------------
// The student's side: what a question looks like to them, what they send back.
//
// No answer key is a typed field anywhere in `quizQuestionStudentSchema`: the
// key (`correctOptionIds`, `correctPairs`, `expected`) lives only inside
// `review`, which the server sends only once the answers are released. The
// raw-JSON leak tests on the backend are the guarantee; this is the type.
// ---------------------------------------------------------------------------

export const studentOptionSchema = z.object({ id: z.number(), label: z.string() }).strict();
export type StudentOption = z.infer<typeof studentOptionSchema>;

const base = {
  id: z.number(),
  order: z.number(),
  prompt: z.string(),
  points: z.number(),
  pointsAwarded: z.number().nullable(),
};

const idPairSchema = z.object({ leftId: z.number(), rightId: z.number() }).strict();

const choiceReview = z.object({ correctOptionIds: z.array(z.number()) }).strict();

const singleChoiceStudent = z
  .object({
    ...base,
    type: z.enum(["SINGLE_CHOICE", "TRUE_FALSE"]),
    options: z.array(studentOptionSchema),
    answer: z.object({ optionId: z.number().nullable() }).strict(),
    review: choiceReview.nullable(),
  })
  .strict();

const multiChoiceStudent = z
  .object({
    ...base,
    type: z.literal("MULTI_CHOICE"),
    options: z.array(studentOptionSchema),
    /** How many to pick (the count of correct options, which is not itself the key). */
    choose: z.number(),
    answer: z.object({ optionIds: z.array(z.number()) }).strict(),
    review: choiceReview.nullable(),
  })
  .strict();

const matchingStudent = z
  .object({
    ...base,
    type: z.literal("MATCHING"),
    left: z.array(studentOptionSchema),
    right: z.array(studentOptionSchema),
    answer: z.object({ pairs: z.array(idPairSchema) }).strict(),
    review: z
      .object({
        pairs: z.array(z.object({ leftId: z.number(), rightId: z.number(), correct: z.boolean() }).strict()),
        correctPairs: z.array(idPairSchema),
      })
      .strict()
      .nullable(),
  })
  .strict();

const fillBlankStudent = z
  .object({
    ...base,
    type: z.literal("FILL_BLANK"),
    blanks: z.array(z.object({ id: z.number(), position: z.number() }).strict()),
    answer: z.object({ blanks: z.array(z.object({ blankId: z.number(), text: z.string() }).strict()) }).strict(),
    review: z
      .object({
        blanks: z.array(
          z.object({ blankId: z.number(), correct: z.boolean().nullable(), expected: z.string() }).strict(),
        ),
      })
      .strict()
      .nullable(),
  })
  .strict();

const essayStudent = z
  .object({
    ...base,
    type: z.literal("ESSAY"),
    answer: z.object({ text: z.string() }).strict(),
    review: z.object({ correct: z.boolean().nullable() }).strict().nullable(),
  })
  .strict();

/**
 * SINGLE_CHOICE and TRUE_FALSE share one member (same fields, `type` is an
 * enum of the two) so a discriminated union still keys on `type`.
 */
export const quizQuestionStudentSchema = z.discriminatedUnion("type", [
  singleChoiceStudent,
  multiChoiceStudent,
  matchingStudent,
  fillBlankStudent,
  essayStudent,
]);
export type QuizQuestionStudent = z.infer<typeof quizQuestionStudentSchema>;

// ---------------------------------------------------------------------------
// Answers the app sends. Identity, not position: ids of options, items, blanks.
// ---------------------------------------------------------------------------

const questionId = z.number().int().positive();
const id = z.number().int().positive();
const unique = (values: number[]) => new Set(values).size === values.length;

export const quizAnswerInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["SINGLE_CHOICE", "TRUE_FALSE"]), questionId, optionId: id.nullable() }).strict(),
  z
    .object({
      type: z.literal("MULTI_CHOICE"),
      questionId,
      optionIds: z.array(id).max(8).refine(unique, { message: "Each option once." }),
    })
    .strict(),
  z
    .object({
      type: z.literal("MATCHING"),
      questionId,
      pairs: z
        .array(z.object({ leftId: id, rightId: id }).strict())
        .max(6)
        .refine((p) => unique(p.map((x) => x.leftId)), { message: "Each left item once." })
        .refine((p) => unique(p.map((x) => x.rightId)), { message: "Each right item once." }),
    })
    .strict(),
  z
    .object({
      type: z.literal("FILL_BLANK"),
      questionId,
      blanks: z.array(z.object({ blankId: id, text: z.string().max(500) }).strict()).max(10),
    })
    .strict(),
  z.object({ type: z.literal("ESSAY"), questionId, text: z.string().max(20000) }).strict(),
]);
export type QuizAnswerInput = z.output<typeof quizAnswerInputSchema>;

/**
 * A batch, unlike v1's one-answer-per-call. The runner debounces and flushes
 * everything pending in one request, so a backgrounded phone loses at most one
 * flush. Membership (is this option of this question) is a server check.
 */
export const saveQuizAnswersRequestSchema = z
  .object({ answers: z.array(quizAnswerInputSchema).min(1).max(100) })
  .strict();
