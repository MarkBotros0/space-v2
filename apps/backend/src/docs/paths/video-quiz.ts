import { conflict, errRef, ok } from "../helpers";
import { idParam, questionIdParam } from "../shared/params";

/** Interactive session-video questions. Assembled into the document by `../openapi.ts`. */
export const videoQuizPaths = {
  "/api/v1/sessions/{id}/video-quiz": {
    get: {
      tags: ["Video quiz"],
      summary: "The student's video quiz",
      description:
        "STUDENT with an **ACTIVE** enrolment in the session's season only (staff use the authoring read) — 403 otherwise. **`correctIndex` is absent from this payload by design**: it travels to a student on exactly one path, the answer response for the question they just answered. `videoId` is resolved server-side so no client parses a URL; `nextQuestionId` is the barrier, derived once.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/StudentVideoQuiz" }, "The quiz and the caller's progress."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/video-quiz/answers": {
    post: {
      tags: ["Video quiz"],
      summary: "Answer a video question",
      description:
        "Same gate as the read. **`out_of_order` (409) is the server-side barrier:** an answer is accepted only for the earliest unanswered question (`atSeconds` asc, `id` asc), which reproduces the ordering v1 enforced only inside its player component. It proves ordering, **not** that the video was watched — `furthestSeconds` is client-reported and no server can observe a YouTube playhead. The first answer is final; repeating a question replays the recorded verdict (200) instead of failing, including a double tap that loses the unique-index race. Completion is derived in the same transaction as the last answer. `furthestSeconds` only moves forward. A question belonging to another session is 404; an index outside the stored options is 400 `invalid_answer`.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitVideoAnswerRequest" } } },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/SubmitVideoAnswerResponse" }, "The verdict and the new progress."),
        400: conflict("`bad_request` or `invalid_answer`."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`out_of_order` — answer the earlier questions first."),
      },
    },
  },
  "/api/v1/sessions/{id}/video-quiz/progress": {
    put: {
      tags: ["Video quiz"],
      summary: "Save playback progress",
      description:
        "Idempotent and monotone: `furthestSeconds` is `max(stored, sent)`, read and written in one transaction. **`completed` is not an accepted field** — a body carrying it is accepted but the key is ignored; completion is derived when the last question is answered, never asserted by the client.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/VideoProgressRequest" } } },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["furthestSeconds", "completedAt"],
            properties: { furthestSeconds: { type: "integer" }, completedAt: { type: ["string", "null"], format: "date-time" } },
          },
          "The stored progress.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/video-questions": {
    get: {
      tags: ["Video quiz"],
      summary: "List video questions with the answer key",
      description:
        "Season ADMIN of the session's season, or SUPER — a group LEADER or MENTOR is refused (403). **This list carries `correctIndex` for every question and must never be requested by a student screen**; v1's equivalent authorized nothing and relied on the admin page being the only caller. Ordered by `atSeconds`, then `id`.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["questions"],
            properties: { questions: { type: "array", items: { $ref: "#/components/schemas/VideoQuestionAdmin" } } },
          },
          "The questions.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    post: {
      tags: ["Video quiz"],
      summary: "Add a video question",
      description:
        "Same gate as the list, checked **before** the body is validated. No check that the session has a `youtubeUrl` or that `atSeconds` fits the video (the length is not stored); the client guards that. `createdById` records who first authored the question.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/VideoQuestionInput" } } },
      },
      responses: {
        201: ok(
          { type: "object", required: ["question"], properties: { question: { $ref: "#/components/schemas/VideoQuestionAdmin" } } },
          "The created question.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/video-questions/{questionId}": {
    patch: {
      tags: ["Video quiz"],
      summary: "Edit a video question and re-grade",
      description:
        "Full replacement of the authored fields (same body as create). **`regradedCount` exists because an edit rewrites history:** when the correct index or the options change, every recorded answer is re-evaluated in the same transaction (an index the shrunken options no longer contain can never be right) and the number whose verdict flipped is returned. `pointsChanged` is true when `points` moved — points are not stored on a response, so nothing is re-graded, but every earned score changed.",
      parameters: [questionIdParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/VideoQuestionInput" } } },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["question", "regradedCount", "pointsChanged"],
            properties: {
              question: { $ref: "#/components/schemas/VideoQuestionAdmin" },
              regradedCount: { type: "integer", minimum: 0 },
              pointsChanged: { type: "boolean" },
            },
          },
          "The updated question and the re-grade outcome.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    delete: {
      tags: ["Video quiz"],
      summary: "Delete a video question",
      description:
        "**`responsesRemoved` counts destroyed student work:** the database cascade deletes every recorded answer to the question, so the client should warn with the `responseCount` it already holds and confirm with this number. `SessionVideoProgress` rows are deliberately left alone (v1 does the same; there is no soft-delete column).",
      parameters: [questionIdParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["deleted", "responsesRemoved"],
            properties: { deleted: { type: "boolean", const: true }, responsesRemoved: { type: "integer", minimum: 0 } },
          },
          "Deleted.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/video-quiz/results": {
    get: {
      tags: ["Video quiz"],
      summary: "Every student's video-quiz result",
      description:
        "Staff with a scope in the session's season (SUPER and season ADMIN: every ACTIVE student; a LEADER: their own groups' ACTIVE students — the same roster as attendance; a MENTOR is refused). One row per ACTIVE enrolment, including students who have answered nothing. New capability: v1 shows no student's video-quiz result to anybody.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/VideoQuizResults" }, "The results."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
} as const;
