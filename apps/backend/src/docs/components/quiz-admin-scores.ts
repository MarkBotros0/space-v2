/**
 * The season admin's score on an ONLINE quiz (plan 4), as the student and the staff see it, and
 * the app's own score beside it. Assembled into the document by `../openapi.ts`.
 */
export const quizAdminScoreSchemas = {
  QuizAdminScore: {
    type: "object",
    description:
      'The season admin\'s score for this student on an ONLINE quiz, with its note, shown at once ("Score entered by your admin"). It counts instead of any attempt, but never shows the questions on its own.',
    required: ["score", "notes"],
    properties: { score: { type: "number" }, notes: { type: ["string", "null"] } },
  },
  QuizAdminScoreStaff: {
    type: "object",
    description:
      "The season admin's score for a student on an ONLINE quiz, which `bestScore` carries. Not `manualScore`.",
    required: ["score", "notes", "gradedAt", "gradedByName"],
    properties: {
      score: { type: "number" },
      notes: { type: ["string", "null"] },
      gradedAt: { type: "string", format: "date-time" },
      gradedByName: { type: ["string", "null"] },
    },
  },
  QuizAppScore: {
    type: ["number", "null"],
    description:
      "The student's best GRADED attempt total (decimal to 2 places), whatever the admin entered: what the admin's score sheet calls \"Graded in the app\". Null with no graded attempt.",
  },
} as const;
