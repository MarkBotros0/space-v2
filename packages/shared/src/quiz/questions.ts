import { z } from "zod";

// ---------------------------------------------------------------------------
// Authoring: the request an admin sends and the read an admin gets back.
// Six question types, one discriminated union each. Objects are `.strict()`.
// The authoring read is the ONLY quiz read that carries the answer key.
// ---------------------------------------------------------------------------

/** Where a fill-in-the-blank prompt has a gap. */
export const BLANK_TOKEN = "{{blank}}";

export function countBlanks(prompt: string): number {
  return prompt.split(BLANK_TOKEN).length - 1;
}

const promptSchema = z.string().trim().min(2).max(2000);
const pointsSchema = z.number().int().min(1).max(100);
const label300 = z.string().trim().min(1).max(300);
const pairLabel = z.string().trim().min(1).max(200);

const optionRequestSchema = z.object({ label: label300, isCorrect: z.boolean() }).strict();

const correctCount = (options: { isCorrect: boolean }[]) => options.filter((o) => o.isCorrect).length;

const hasUnique = (values: string[]) => new Set(values).size === values.length;

const singleChoiceRequest = z
  .object({
    type: z.literal("SINGLE_CHOICE"),
    prompt: promptSchema,
    points: pointsSchema,
    options: z.array(optionRequestSchema).min(2).max(6),
  })
  .strict()
  .refine((d) => correctCount(d.options) === 1, { path: ["options"], message: "Mark exactly one correct answer." });

const multiChoiceRequest = z
  .object({
    type: z.literal("MULTI_CHOICE"),
    prompt: promptSchema,
    points: pointsSchema,
    options: z.array(optionRequestSchema).min(3).max(8),
  })
  .strict()
  .refine((d) => correctCount(d.options) >= 2 && correctCount(d.options) < d.options.length, {
    path: ["options"],
    message: "Mark at least 2 correct answers, and leave at least one wrong.",
  });

const trueFalseRequest = z
  .object({
    type: z.literal("TRUE_FALSE"),
    prompt: promptSchema,
    points: pointsSchema,
    correct: z.boolean(),
  })
  .strict();

const matchingRequest = z
  .object({
    type: z.literal("MATCHING"),
    prompt: promptSchema,
    points: pointsSchema,
    pairs: z
      .array(z.object({ left: pairLabel, right: pairLabel }).strict())
      .min(2)
      .max(6),
  })
  .strict()
  .refine((d) => hasUnique(d.pairs.map((p) => p.left)), { path: ["pairs"], message: "Each left item must differ." })
  .refine((d) => hasUnique(d.pairs.map((p) => p.right)), { path: ["pairs"], message: "Each right item must differ." });

const fillBlankRequest = z
  .object({
    type: z.literal("FILL_BLANK"),
    prompt: promptSchema,
    points: pointsSchema,
    answers: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
  })
  .strict()
  .refine((d) => d.answers.length === countBlanks(d.prompt), {
    path: ["answers"],
    message: "Give one answer for each blank in the question.",
  });

const essayRequest = z
  .object({
    type: z.literal("ESSAY"),
    prompt: promptSchema,
    points: pointsSchema,
  })
  .strict();

export const quizQuestionRequestSchema = z.discriminatedUnion("type", [
  singleChoiceRequest,
  multiChoiceRequest,
  trueFalseRequest,
  matchingRequest,
  fillBlankRequest,
  essayRequest,
]);
/** What a client form sends (before trimming). */
export type QuizQuestionInput = z.input<typeof quizQuestionRequestSchema>;

// ---------------------------------------------------------------------------
// Authoring read
// ---------------------------------------------------------------------------

const authoringBase = { id: z.number(), order: z.number(), prompt: z.string(), points: z.number() };
const optionAuthoringSchema = z.object({ id: z.number(), label: z.string(), isCorrect: z.boolean() }).strict();

export const quizQuestionAuthoringSchema = z.discriminatedUnion("type", [
  z.object({ ...authoringBase, type: z.literal("SINGLE_CHOICE"), options: z.array(optionAuthoringSchema) }).strict(),
  z.object({ ...authoringBase, type: z.literal("MULTI_CHOICE"), options: z.array(optionAuthoringSchema) }).strict(),
  z.object({ ...authoringBase, type: z.literal("TRUE_FALSE"), correct: z.boolean() }).strict(),
  z
    .object({
      ...authoringBase,
      type: z.literal("MATCHING"),
      pairs: z.array(
        z.object({ leftId: z.number(), left: z.string(), rightId: z.number(), right: z.string() }).strict(),
      ),
    })
    .strict(),
  z
    .object({
      ...authoringBase,
      type: z.literal("FILL_BLANK"),
      blanks: z.array(z.object({ id: z.number(), position: z.number(), expected: z.string() }).strict()),
    })
    .strict(),
  z.object({ ...authoringBase, type: z.literal("ESSAY") }).strict(),
]);
export type QuizQuestionAuthoring = z.infer<typeof quizQuestionAuthoringSchema>;
