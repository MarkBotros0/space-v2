import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

const studentUserIdParam = { name: "studentUserId", in: "path", required: true, schema: { type: "integer" } } as const;

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
        "**The row shape differs by role.** Staff (SUPER, season admin, leader with a group in the season) receive `QuizSummary` rows. A STUDENT receives their own `StudentQuizResult` rows and `nextCursor` is always null: PAPER quizzes appear once their grade is entered, ONLINE quizzes as soon as they are published. An ONLINE row's `score` is the score that counts (the season admin's score when there is one, carried with its note in `adminScore`, else the best graded attempt) and shows at once; answers wait for the release (`answersReleased`).\n\n`seasonId` defaults to the caller's active season; with none, the list is empty. Staff outside the season get 403.\n\nOne definition each, computed server-side: `studentCount` is the ACTIVE enrolments of the quiz's season narrowed to the caller's scope (a leader sees only their own groups); `gradedCount` is, within that same student set, QuizGrade rows with a non-null score for PAPER, and for ONLINE each student once who has a GRADED attempt or the admin's score.",
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
        "**Two response schemas, chosen by role on the server.** Staff with a scope in the quiz's season (SUPER, season admin, leader of a group in it) receive `QuizAuthoringDetail`, which **carries the answer key** because grading needs it. A STUDENT receives `StudentQuizDetail`, whose questions have **no answer key at all** outside `review`, which stays null until the answers are released; this is enforced by separate loaders with separate selects and pinned by a raw-JSON integration test. A student gets 404 for a quiz that is unpublished, PAPER, or in a season they cannot access (indistinguishable from a missing quiz). A GET never creates an attempt.",
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
      summary: "Edit a quiz's title, session, max score or shuffle",
      description:
        "Season-admin (or SUPER) of the quiz's season. `kind` can never change. `maxScore` is refused with 409 `wrong_quiz_kind` on an ONLINE quiz (it is derived), and with 409 `quiz_has_grades` on a PAPER quiz that already has grades — moving the denominator under awarded scores is refused, not silently applied. A new `sessionId` must belong to the quiz's season. `shuffleQuestions` switches the per-attempt question shuffle (on by default).",
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
        "Season-admin (or SUPER) only — a leader is refused. The body is one of six shapes by `type` (single choice, multiple choice, true/false, matching, fill in the blank, essay), each with its whole-number points (1-100, set by the admin). Appended at the end (`order` = current count) and, in the same transaction, the quiz's `maxScore` is recomputed as the sum of question points.\n\n**Structural freeze (D3):** once any attempt exists, or the season admin has entered a score, every question write (add, edit, delete, reorder) is refused with 409 `quiz_has_attempts`; nothing versions a quiz, so editing under attempts would rebase graded scores or cascade-delete graded answers. A PAPER quiz has no questions: 409 `wrong_quiz_kind`.",
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
        "Season-admin only. Body `{ publish: boolean }`. A draft season's roster is not notified. Publishing requires at least one question (409 `no_questions`) and every question to have the answer key its type needs (409 `mcq_without_answer`; the code predates the six question types and is kept for compatibility); it is allowed while attempts exist. **Unpublishing is refused (409 `quiz_has_graded_attempts`) once any attempt is GRADED (D4)** — both student reads filter on `publishedAt`, so unpublishing would make graded students lose their own result; likewise once any student has the season admin's score (plan 4), checked under the Quiz lock. A PAPER quiz cannot be published (409 `wrong_quiz_kind`). The draft → published transition (only that; a republish of a live quiz is silent) sends one `QUIZ_PUBLISHED` notification, \"New quiz: <title>\" with link `/student/quizzes`, to every student with an ACTIVE enrolment in the quiz's season — the audience the student quiz list shows it to (best-effort). Returns the new `publishedAt` (null when unpublished).",
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
      summary: "Release a quiz's answers to its students",
      description:
        "SUPER or admin of the quiz's season; a leader is refused (403). Students see their score as soon as an attempt is graded, with no release. Until this call they see no questions, options, own answers or right and wrong, so a student who takes the quiz later can't learn the answers from one who took it first. Releasing lets them review every question with each option, tick, pair and blank marked right or wrong and the correct answer shown. One way: there is no un-release. An unpublished ONLINE quiz is refused (409 `quiz_not_published`). Only the request that flips it sends one `QUIZ_GRADED` notification, \"Answers are out: <title>\", to each student with a GRADED attempt on an ONLINE quiz (best-effort); a PAPER quiz notifies nobody on release (a paper grade notifies when entered or changed). A repeat answers 200 with the stored time and sends nothing",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["answersReleasedAt"],
            properties: { answersReleasedAt: { type: "string", format: "date-time" } },
          },
          "When the answers were released.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`quiz_not_published`."),
      },
    },
  },

  "/api/v1/quizzes/{id}/manual-scores/{studentUserId}": {
    put: {
      tags: ["Quizzes"],
      summary: "Enter or edit the admin's score for one student on an online quiz",
      description:
        "SUPER or admin of the quiz's season; a leader or another season's admin is refused (403). ONLINE quizzes only (409 `quiz_not_online`; a paper quiz has its grade sheet), and published (409 `quiz_not_published`, \"Publish the quiz before entering a score.\", read under the Quiz lock). A finished season's scores never change (409 `season_finished`, \"This season has ended; its scores can't change.\", read under the Season lock, so a save can't land during season End). 404 for a quiz in a deleted season, and for a student who is not a live user among the quiz's season participants. Stored as the student's `QuizGrade` row, and it always counts instead of any in-app attempt, even a higher one. `score` is 0 to the quiz's `maxScore` with at most two decimals, rounded to exactly two (400 `bad_request`, or 400 `score_exceeds_max` above the max). Refused while the student has an attempt open (409 `attempt_open`, \"End their attempt first.\"), checked with their attempts locked. A new or changed score sends one `QUIZ_GRADED` notification, \"Your score is in\" (best-effort), as a paper grade does; a notes-only edit is saved (restamping `gradedAt` and `gradedBy`) but sends nothing, and a re-save of the same score and notes changes nothing. The response has no question, answer or key.",
      parameters: [idParam, studentUserIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["score"],
              properties: {
                score: { type: "number", minimum: 0, multipleOf: 0.01 },
                notes: { type: ["string", "null"], maxLength: 1000, description: "Shown to the student." },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["score", "notes", "gradedAt", "gradedBy"],
            properties: {
              score: { type: "number" },
              notes: { type: ["string", "null"] },
              gradedAt: { type: "string", format: "date-time" },
              gradedBy: {
                type: "object",
                required: ["id", "name"],
                properties: { id: { type: "integer" }, name: { type: "string" } },
              },
            },
          },
          "The stored manual score.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`quiz_not_online`, `quiz_not_published`, `season_finished` or `attempt_open`."),
      },
    },
    delete: {
      tags: ["Quizzes"],
      summary: "Clear the admin's score for one student on an online quiz",
      description:
        "The same gate, quiz kind, live season and student checks as the PUT; allowed on an unpublished quiz, so a score can be cleared after unpublishing. Refused on a finished season (409 `season_finished`), under the same Season, Quiz and student locks as the PUT. Deletes the row, so the student's best graded attempt counts again; nothing reopens and nobody is notified. 204 also when there was no score.",
      parameters: [idParam, studentUserIdParam],
      responses: {
        204: { description: "Cleared." },
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`quiz_not_online` or `season_finished`."),
      },
    },
  },
} as const;
