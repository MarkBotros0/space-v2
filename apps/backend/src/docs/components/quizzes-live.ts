/** The staff live screen's schema. Assembled into the document by `../openapi.ts`. */
export const quizLiveSchemas = {
  QuizLive: {
    type: "object",
    required: ["quizId", "title", "timeLimitMinutes", "serverNow", "rows"],
    properties: {
      quizId: { type: "integer" },
      title: { type: "string" },
      timeLimitMinutes: { type: ["integer", "null"] },
      serverNow: { type: "string", format: "date-time", description: "The server's clock, for the countdown." },
      rows: {
        type: "array",
        description:
          "Every student in the caller's scope, latest attempt each. Order: open with exits, open, not started, then finished; each by name.",
        items: {
          type: "object",
          required: ["studentUserId", "studentName", "groupName", "state", "deadlineAt", "exits", "lastExitAt"],
          properties: {
            studentUserId: { type: "integer" },
            studentName: { type: ["string", "null"] },
            groupName: { type: ["string", "null"] },
            state: {
              type: "string",
              enum: [
                "not_started",
                "in_progress",
                "submitted",
                "graded",
                "timed_out",
                "ended_by_exits",
                "ended_by_staff",
              ],
            },
            deadlineAt: {
              type: ["string", "null"],
              format: "date-time",
              description: "Only while in_progress and timed.",
            },
            exits: { type: "integer", description: "EXIT + RELAUNCH events of the latest attempt." },
            lastExitAt: { type: ["string", "null"], format: "date-time" },
          },
        },
      },
    },
  },
};
