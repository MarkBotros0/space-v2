/**
 * Quiz schemas for the student and the leader: answers sent, questions as a student sees them, the grading view
 * and the marks. Assembled into the document by `../openapi.ts`.
 */
const id = { type: "integer" } as const;
const text = { type: "string" } as const;

const studentOption = {
  type: "object",
  required: ["id", "label"],
  description: "An option or matching item. Nothing here says whether it is right.",
  properties: { id, label: text },
} as const;

const studentBase = {
  id,
  order: { type: "integer" },
  prompt: text,
  points: { type: "integer" },
  pointsAwarded: { type: ["number", "null"], description: "Decimal to 2 places; null until graded and released." },
} as const;
const studentRequired = ["id", "order", "type", "prompt", "points", "pointsAwarded", "answer", "review"];
const idPair = {
  type: "object",
  required: ["leftId", "rightId"],
  properties: { leftId: id, rightId: id },
} as const;
const review = (description: string, schema: object) => ({ oneOf: [schema, { type: "null" }], description });
const choiceReview = {
  type: "object",
  required: ["correctOptionIds"],
  properties: { correctOptionIds: { type: "array", items: id } },
} as const;

const gradingBase = {
  questionId: id,
  prompt: text,
  points: { type: "integer" },
  pointsAwarded: { type: ["number", "null"] },
} as const;
const gradingRequired = ["questionId", "type", "prompt", "points", "pointsAwarded"];
const gradingOption = {
  type: "object",
  required: ["id", "label", "isCorrect"],
  properties: { id, label: text, isCorrect: { type: "boolean" } },
} as const;

export const quizAnswerSchemas = {
  QuizAnswerInput: {
    description:
      "One answer, by identity (ids of options, items and blanks), never by position. Discriminated on `type`; no extra keys.",
    oneOf: [
      {
        type: "object",
        required: ["type", "questionId", "optionId"],
        properties: {
          type: { enum: ["SINGLE_CHOICE", "TRUE_FALSE"] },
          questionId: { type: "integer", minimum: 1 },
          optionId: { type: ["integer", "null"], minimum: 1 },
        },
      },
      {
        type: "object",
        required: ["type", "questionId", "optionIds"],
        description: 'More than N ids is refused (400 `too_many_choices`, "Choose at most N.").',
        properties: {
          type: { const: "MULTI_CHOICE" },
          questionId: { type: "integer", minimum: 1 },
          optionIds: { type: "array", maxItems: 8, items: { type: "integer", minimum: 1 } },
        },
      },
      {
        type: "object",
        required: ["type", "questionId", "pairs"],
        description: "Each left and each right id at most once.",
        properties: {
          type: { const: "MATCHING" },
          questionId: { type: "integer", minimum: 1 },
          pairs: { type: "array", maxItems: 6, items: idPair },
        },
      },
      {
        type: "object",
        required: ["type", "questionId", "blanks"],
        properties: {
          type: { const: "FILL_BLANK" },
          questionId: { type: "integer", minimum: 1 },
          blanks: {
            type: "array",
            maxItems: 10,
            items: {
              type: "object",
              required: ["blankId", "text"],
              properties: { blankId: { type: "integer", minimum: 1 }, text: { type: "string", maxLength: 500 } },
            },
          },
        },
      },
      {
        type: "object",
        required: ["type", "questionId", "text"],
        properties: {
          type: { const: "ESSAY" },
          questionId: { type: "integer", minimum: 1 },
          text: { type: "string", maxLength: 20000 },
        },
      },
    ],
  },
  QuizQuestionStudent: {
    description:
      "The student projection of a question, in this attempt's shuffled order. **No answer key anywhere outside `review`**, and `review` is non-null only once the answers are released. A different shape from `QuizQuestionAuthoring`.",
    oneOf: [
      {
        type: "object",
        required: [...studentRequired, "options"],
        description: "SINGLE_CHOICE or TRUE_FALSE (true/false is not shuffled).",
        properties: {
          ...studentBase,
          type: { enum: ["SINGLE_CHOICE", "TRUE_FALSE"] },
          options: { type: "array", items: studentOption },
          answer: { type: "object", required: ["optionId"], properties: { optionId: { type: ["integer", "null"] } } },
          review: review("The correct option ids; set once the answers are released.", choiceReview),
        },
      },
      {
        type: "object",
        required: [...studentRequired, "options", "choose"],
        properties: {
          ...studentBase,
          type: { const: "MULTI_CHOICE" },
          options: { type: "array", items: studentOption },
          choose: { type: "integer", description: 'How many to pick ("Choose N").' },
          answer: {
            type: "object",
            required: ["optionIds"],
            properties: { optionIds: { type: "array", items: id } },
          },
          review: review("The correct option ids; set once the answers are released.", choiceReview),
        },
      },
      {
        type: "object",
        required: [...studentRequired, "left", "right"],
        description: "MATCHING: both columns are shuffled separately for each attempt.",
        properties: {
          ...studentBase,
          type: { const: "MATCHING" },
          left: { type: "array", items: studentOption },
          right: { type: "array", items: studentOption },
          answer: { type: "object", required: ["pairs"], properties: { pairs: { type: "array", items: idPair } } },
          review: review("Right or wrong per chosen pair, and the correct pairs.", {
            type: "object",
            required: ["pairs", "correctPairs"],
            properties: {
              pairs: {
                type: "array",
                items: {
                  type: "object",
                  required: ["leftId", "rightId", "correct"],
                  properties: { leftId: id, rightId: id, correct: { type: "boolean" } },
                },
              },
              correctPairs: { type: "array", items: idPair },
            },
          }),
        },
      },
      {
        type: "object",
        required: [...studentRequired, "blanks"],
        properties: {
          ...studentBase,
          type: { const: "FILL_BLANK" },
          blanks: {
            type: "array",
            items: { type: "object", required: ["id", "position"], properties: { id, position: { type: "integer" } } },
          },
          answer: {
            type: "object",
            required: ["blanks"],
            properties: {
              blanks: {
                type: "array",
                items: {
                  type: "object",
                  required: ["blankId", "text"],
                  properties: { blankId: id, text: text },
                },
              },
            },
          },
          review: review("Per blank: right or wrong (null until a leader marks it) and the expected answer.", {
            type: "object",
            required: ["blanks"],
            properties: {
              blanks: {
                type: "array",
                items: {
                  type: "object",
                  required: ["blankId", "correct", "expected"],
                  properties: { blankId: id, correct: { type: ["boolean", "null"] }, expected: text },
                },
              },
            },
          }),
        },
      },
      {
        type: "object",
        required: studentRequired,
        properties: {
          ...studentBase,
          type: { const: "ESSAY" },
          answer: { type: "object", required: ["text"], properties: { text } },
          review: review("Right or wrong, null until a leader marks it.", {
            type: "object",
            required: ["correct"],
            properties: { correct: { type: ["boolean", "null"] } },
          }),
        },
      },
    ],
  },
  QuizGradingAnswer: {
    description:
      "Grader-only: carries the answer key by design, in the author's order. FILL_BLANK (per blank) and ESSAY are what the leader marks; `correct` null means not marked yet.",
    oneOf: [
      {
        type: "object",
        required: [...gradingRequired, "options", "selectedOptionId"],
        properties: {
          ...gradingBase,
          type: { enum: ["SINGLE_CHOICE", "TRUE_FALSE"] },
          options: { type: "array", items: gradingOption },
          selectedOptionId: { type: ["integer", "null"] },
        },
      },
      {
        type: "object",
        required: [...gradingRequired, "options", "selectedOptionIds"],
        properties: {
          ...gradingBase,
          type: { const: "MULTI_CHOICE" },
          options: { type: "array", items: gradingOption },
          selectedOptionIds: { type: "array", items: id },
        },
      },
      {
        type: "object",
        required: [...gradingRequired, "pairs", "chosen"],
        properties: {
          ...gradingBase,
          type: { const: "MATCHING" },
          pairs: {
            type: "array",
            items: {
              type: "object",
              required: ["leftId", "left", "rightId", "right"],
              properties: { leftId: id, left: text, rightId: id, right: text },
            },
          },
          chosen: { type: "array", items: idPair },
        },
      },
      {
        type: "object",
        required: [...gradingRequired, "blanks"],
        properties: {
          ...gradingBase,
          type: { const: "FILL_BLANK" },
          blanks: {
            type: "array",
            items: {
              type: "object",
              required: ["blankId", "position", "expected", "text", "correct"],
              properties: {
                blankId: id,
                position: { type: "integer" },
                expected: text,
                text: { type: ["string", "null"], description: "The student's answer." },
                correct: { type: ["boolean", "null"] },
              },
            },
          },
        },
      },
      {
        type: "object",
        required: [...gradingRequired, "text", "correct"],
        properties: {
          ...gradingBase,
          type: { const: "ESSAY" },
          text: { type: ["string", "null"] },
          correct: { type: ["boolean", "null"] },
        },
      },
    ],
  },
  MarkAttemptRequest: {
    type: "object",
    required: ["marks"],
    description:
      "A mark for every leader-marked item of the attempt: right or wrong (`correct`) for each FILL_BLANK blank (`blankId`), and the points awarded (`points`, a whole number from 0 to the question's points) for each ESSAY question (`blankId` null). An essay may carry `correct` instead (all or none of its points). Each mark has exactly one of the two. The set must be complete (409 `marks_incomplete`); points on a blank, or more than the essay's points, are 400 `mark_out_of_range`.",
    properties: {
      marks: {
        type: "array",
        minItems: 1,
        maxItems: 200,
        items: {
          type: "object",
          required: ["questionId", "blankId"],
          properties: {
            questionId: { type: "integer", minimum: 1 },
            blankId: { type: ["integer", "null"], minimum: 1 },
            correct: { type: "boolean" },
            points: { type: "integer", minimum: 0, maximum: 100 },
          },
        },
      },
    },
  },
} as const;
