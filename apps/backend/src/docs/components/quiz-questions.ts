/**
 * Quiz question schemas an admin authors: the six types as they are written and read back with the answer key.
 * Assembled into the document by `../openapi.ts`.
 */
const id = { type: "integer" } as const;
const text = { type: "string" } as const;

const authoringBase = {
  id,
  order: { type: "integer", description: "A 0-based position; renumbered on delete." },
  prompt: text,
  points: { type: "integer", minimum: 1, maximum: 100 },
} as const;
const authoringRequired = ["id", "order", "type", "prompt", "points"];

const requestBase = {
  prompt: { type: "string", minLength: 2, maxLength: 2000 },
  points: { type: "integer", minimum: 1, maximum: 100, description: "Whole points, set by the admin." },
} as const;

const requestOption = {
  type: "object",
  required: ["label", "isCorrect"],
  properties: { label: { type: "string", minLength: 1, maxLength: 300 }, isCorrect: { type: "boolean" } },
} as const;

const authoringOption = {
  type: "object",
  required: ["id", "label", "isCorrect"],
  properties: { id, label: text, isCorrect: { type: "boolean" } },
} as const;

export const quizQuestionSchemas = {
  QuizQuestionType: {
    type: "string",
    enum: ["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE", "MATCHING", "FILL_BLANK", "ESSAY"],
    description:
      'Single choice, multiple choice ("Choose N"), true/false, matching, fill in the blank and essay. Existing MCQ questions became SINGLE_CHOICE.',
  },
  QuizQuestionRequest: {
    description:
      "What an admin sends to create or replace a question, one shape per `type` (discriminated on `type`, no extra keys). The prompt of a FILL_BLANK question holds one `{{blank}}` per gap and `answers` has one expected answer per gap, in order.",
    oneOf: [
      {
        type: "object",
        required: ["type", "prompt", "points", "options"],
        description: "SINGLE_CHOICE: 2 to 6 options, exactly one correct.",
        properties: {
          type: { const: "SINGLE_CHOICE" },
          ...requestBase,
          options: { type: "array", minItems: 2, maxItems: 6, items: requestOption },
        },
      },
      {
        type: "object",
        required: ["type", "prompt", "points", "options"],
        description:
          'MULTI_CHOICE: 3 to 8 options, at least 2 correct and at least one wrong. The student is told "Choose N" where N is the number of correct options.',
        properties: {
          type: { const: "MULTI_CHOICE" },
          ...requestBase,
          options: { type: "array", minItems: 3, maxItems: 8, items: requestOption },
        },
      },
      {
        type: "object",
        required: ["type", "prompt", "points", "correct"],
        description: "TRUE_FALSE: never shuffled.",
        properties: { type: { const: "TRUE_FALSE" }, ...requestBase, correct: { type: "boolean" } },
      },
      {
        type: "object",
        required: ["type", "prompt", "points", "pairs"],
        description: "MATCHING: 2 to 6 pairs; each left item and each right item must differ.",
        properties: {
          type: { const: "MATCHING" },
          ...requestBase,
          pairs: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              required: ["left", "right"],
              properties: {
                left: { type: "string", minLength: 1, maxLength: 200 },
                right: { type: "string", minLength: 1, maxLength: 200 },
              },
            },
          },
        },
      },
      {
        type: "object",
        required: ["type", "prompt", "points", "answers"],
        description: "FILL_BLANK: 1 to 10 gaps; `answers.length` must equal the number of `{{blank}}` in the prompt.",
        properties: {
          type: { const: "FILL_BLANK" },
          ...requestBase,
          answers: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 200 },
          },
        },
      },
      {
        type: "object",
        required: ["type", "prompt", "points"],
        description: "ESSAY: a leader gives it points, from 0 to its points.",
        properties: { type: { const: "ESSAY" }, ...requestBase },
      },
    ],
  },
  QuizQuestionAuthoring: {
    description:
      "The authoring projection: the only quiz question shape that carries the answer key (`isCorrect`, `correct`, the pair partners, each blank's `expected`).",
    oneOf: [
      {
        type: "object",
        required: [...authoringRequired, "options"],
        description: "SINGLE_CHOICE or MULTI_CHOICE.",
        properties: {
          ...authoringBase,
          type: { enum: ["SINGLE_CHOICE", "MULTI_CHOICE"] },
          options: { type: "array", items: authoringOption },
        },
      },
      {
        type: "object",
        required: [...authoringRequired, "correct"],
        properties: { ...authoringBase, type: { const: "TRUE_FALSE" }, correct: { type: "boolean" } },
      },
      {
        type: "object",
        required: [...authoringRequired, "pairs"],
        properties: {
          ...authoringBase,
          type: { const: "MATCHING" },
          pairs: {
            type: "array",
            items: {
              type: "object",
              required: ["leftId", "left", "rightId", "right"],
              properties: { leftId: id, left: text, rightId: id, right: text },
            },
          },
        },
      },
      {
        type: "object",
        required: [...authoringRequired, "blanks"],
        properties: {
          ...authoringBase,
          type: { const: "FILL_BLANK" },
          blanks: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "position", "expected"],
              properties: { id, position: { type: "integer" }, expected: text },
            },
          },
        },
      },
      {
        type: "object",
        required: authoringRequired,
        properties: { ...authoringBase, type: { const: "ESSAY" } },
      },
    ],
  },
} as const;
