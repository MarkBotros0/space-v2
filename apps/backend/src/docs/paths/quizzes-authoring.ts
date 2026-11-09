import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** Quiz authoring. Assembled into the document by `../openapi.ts`. */
export const quizAuthoringPaths = {
  "/api/v1/quizzes": {
    post: {
      tags: ["Quizzes"],
      summary: "Create a quiz",
      description:
        "Season-admin (or SUPER) only. `seasonId` is in the **body**, not the path: every quiz route lives in one router mounted at `/api/v1/quizzes`, so creation cannot hang off `/seasons/{id}` — the same deviation `POST /api/v1/sessions` makes. `sessionId` may be null (a season-level quiz); when set it must belong to `seasonId` (400 `session_not_in_season`). PAPER requires `maxScore`; ONLINE **rejects** it (400) and starts at 0, then derives it from question points.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/CreateQuizRequest" } } },
      },
      responses: {
        201: ok({ type: "object", required: ["id"], properties: { id: { type: "integer" } } }, "Created."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    get: {
      tags: ["Quizzes"],
      summary: "List quizzes (row shape depends on the caller's role)",
      description:
        "**The row shape differs by role.** Staff (SUPER, season admin, leader with a group in the season) receive `QuizSummary` rows. A STUDENT receives their own `StudentQuizResult` rows and `nextCursor` is always null: PAPER quizzes appear only once graded and released, ONLINE quizzes as soon as they are published.\n\n`seasonId` defaults to the caller's active season; with none, the list is empty. Staff outside the season get 403.\n\nOne definition each, computed server-side: `studentCount` is the ACTIVE enrolments of the quiz's season narrowed to the caller's scope (a leader sees only their own groups); `gradedCount` is, within that same student set, QuizGrade rows with a non-null score for PAPER and QuizAttempt rows with status GRADED for ONLINE.",
      parameters: [
        { name: "seasonId", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "sessionId", in: "query", schema: { type: "integer", minimum: 1 } },
        {
          name: "cursor",
          in: "query",
          description: "Quiz id; returns rows with a smaller id.",
          schema: { type: "integer", minimum: 1 },
        },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["items", "nextCursor"],
            properties: {
              items: {
                type: "array",
                items: {
                  oneOf: [
                    { $ref: "#/components/schemas/QuizSummary" },
                    { $ref: "#/components/schemas/StudentQuizResult" },
                  ],
                },
              },
              nextCursor: { type: ["integer", "null"] },
            },
          },
          "Newest first for staff; by session date descending for a student.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/quizzes/{id}": {
    get: {
      tags: ["Quizzes"],
      summary: "Quiz detail (the schema depends on the caller's role)",
      description:
        "**Two response schemas, chosen by role on the server.** Staff with a scope in the quiz's season (SUPER, season admin, leader of a group in it) receive `QuizAuthoringDetail`, which **carries the answer key** because grading needs it. A STUDENT receives `StudentQuizDetail`, whose questions have **no `correctIndex` field at all**; this is enforced by separate loaders with separate selects and pinned by a raw-JSON integration test. A student gets 404 for a quiz that is unpublished, PAPER, or in a season they cannot access (indistinguishable from a missing quiz). A GET never creates an attempt.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            oneOf: [
              { $ref: "#/components/schemas/QuizAuthoringDetail" },
              { $ref: "#/components/schemas/StudentQuizDetail" },
            ],
          },
          "`QuizAuthoringDetail` for staff, `StudentQuizDetail` for a student.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Quizzes"],
      summary: "Edit a quiz's title, session or max score",
      description:
        "Season-admin (or SUPER) of the quiz's season. `kind` can never change. `maxScore` is refused with 409 `wrong_quiz_kind` on an ONLINE quiz (it is derived), and with 409 `quiz_has_grades` on a PAPER quiz that already has grades — moving the denominator under awarded scores is refused, not silently applied. A new `sessionId` must belong to the quiz's season.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateQuizRequest" } } },
      },
      responses: {
        200: ok(
          { type: "object", required: ["updated"], properties: { updated: { type: "boolean", const: true } } },
          "Updated.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`wrong_quiz_kind` or `quiz_has_grades`."),
      },
    },
  },

  "/api/v1/quizzes/{id}/questions": {
    post: {
      tags: ["Quizzes"],
      summary: "Add a question to an ONLINE quiz",
      description:
        "Season-admin (or SUPER) only — a leader is refused. Appended at the end (`order` = current count) and, in the same transaction, the quiz's `maxScore` is recomputed as the sum of question points.\n\n**Structural freeze (D3):** once any attempt exists, every question write (add, edit, delete, reorder) is refused with 409 `quiz_has_attempts`; nothing versions a quiz, so editing under attempts would rebase graded scores or cascade-delete graded answers. A PAPER quiz has no questions: 409 `wrong_quiz_kind`.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/QuizQuestionRequest" } } },
      },
      responses: {
        201: ok({ $ref: "#/components/schemas/QuizQuestionAuthoring" }, "The created question."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
      },
    },
  },
  "/api/v1/quizzes/{id}/questions/order": {
    put: {
      tags: ["Quizzes"],
      summary: "Reorder a quiz's questions",
      description:
        "Season-admin only. `questionIds` must be an exact permutation of the quiz's current question ids (400 `invalid_order` otherwise — a partial list would leave omitted questions on stale positions). Subject to the same attempt freeze as every question write (409 `quiz_has_attempts`). Returns the questions in their new order.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["questionIds"],
              properties: { questionIds: { type: "array", minItems: 1, items: { type: "integer", minimum: 1 } } },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["questions"],
            properties: { questions: { type: "array", items: { $ref: "#/components/schemas/QuizQuestionAuthoring" } } },
          },
          "The reordered questions.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
      },
    },
  },
  "/api/v1/quizzes/{id}/questions/{questionId}": {
    patch: {
      tags: ["Quizzes"],
      summary: "Replace a question's content",
      description:
        "Season-admin only. Takes the same body as create; `order` is not writable here (use the reorder endpoint). The question is addressed through its quiz: an id belonging to another quiz is 404 `question_not_in_quiz`. Recomputes `maxScore`. Frozen once attempts exist (409 `quiz_has_attempts`).",
      parameters: [
        idParam,
        { name: "questionId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/QuizQuestionRequest" } } },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/QuizQuestionAuthoring" }, "The updated question."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` (quiz) or `question_not_in_quiz`."),
        409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
      },
    },
    delete: {
      tags: ["Quizzes"],
      summary: "Delete a question",
      description:
        "Season-admin only. In one transaction: deletes the question, renumbers the survivors to a gap-free `0..n-1`, and recomputes `maxScore`. Frozen once attempts exist (409 `quiz_has_attempts`); 404 `question_not_in_quiz` for another quiz's question.",
      parameters: [
        idParam,
        { name: "questionId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      ],
      responses: {
        200: ok(
          { type: "object", required: ["deleted"], properties: { deleted: { type: "boolean", const: true } } },
          "Deleted.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` (quiz) or `question_not_in_quiz`."),
        409: conflict("`wrong_quiz_kind` or `quiz_has_attempts`."),
      },
    },
  },
  "/api/v1/quizzes/{id}/publish": {
    post: {
      tags: ["Quizzes"],
      summary: "Publish or unpublish an ONLINE quiz",
      description:
        "Season-admin only. Body `{ publish: boolean }`. A draft season's roster is not notified. Publishing requires at least one question (409 `no_questions`) and every MCQ to have a `correctIndex` inside its options (409 `mcq_without_answer`); it is allowed while attempts exist. **Unpublishing is refused (409 `quiz_has_graded_attempts`) once any attempt is GRADED (D4)** — both student reads filter on `publishedAt`, so unpublishing would make graded students lose their own result. A PAPER quiz cannot be published (409 `wrong_quiz_kind`). The draft → published transition (only that; a republish of a live quiz is silent) sends one `QUIZ_PUBLISHED` notification, \"New quiz: <title>\" with link `/student/quizzes`, to every student with an ACTIVE enrolment in the quiz's season — the audience the student quiz list shows it to (best-effort). Returns the new `publishedAt` (null when unpublished).",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["publish"], properties: { publish: { type: "boolean" } } },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["publishedAt"],
            properties: { publishedAt: { type: ["string", "null"], format: "date-time" } },
          },
          "The new publish state.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`wrong_quiz_kind`, `no_questions`, `mcq_without_answer` or `quiz_has_graded_attempts`."),
      },
    },
  },

  "/api/v1/quizzes/{id}/release": {
    post: {
      tags: ["Quizzes"],
      summary: "Release a quiz's results to its students",
      description:
        "SUPER or admin of the quiz's season (owner, 2026-11-07). Until a quiz is released every student read hides the marking — no score, no `gradedAt`, no right or wrong answer, and a graded attempt reads SUBMITTED — so a student who takes it later can't learn the answers from one who took it first; grading stays silent too. One way: there is no un-release. An unpublished ONLINE quiz is refused (409 `quiz_not_published`). Only the request that flips it sends one `QUIZ_GRADED` notification, \"Results are out: <title>\", to each student with a PAPER grade or a GRADED latest attempt (best-effort); a repeat answers 200 with the stored time and sends nothing. Grades made after the release notify as usual.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["resultsReleasedAt"],
            properties: { resultsReleasedAt: { type: "string", format: "date-time" } },
          },
          "When the results were released.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`quiz_not_published`."),
      },
    },
  },
} as const;
