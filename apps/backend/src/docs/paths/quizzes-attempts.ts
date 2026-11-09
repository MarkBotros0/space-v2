import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** Quiz attempts, grading and grades. Assembled into the document by `../openapi.ts`. */
export const quizAttemptsPaths = {
  "/api/v1/quizzes/{id}/attempt": {
    put: {
      tags: ["Quizzes"],
      summary: "Start or resume the caller's attempt",
      description:
        "STUDENT only (staff get 403), with an ACTIVE enrolment in the quiz's season — a withdrawn or completed student, or an alumnus who isn't studying in it, gets 403 (the same gate applies to save and submit). Idempotent create-or-resume: the first call creates attempt 1 (an upsert on the natural key, so concurrent calls cannot create two); later calls return the same attempt. The attempt is addressed by quiz, never by attempt id. 409 `quiz_not_published` if the quiz is PAPER or unpublished; 409 `attempt_closed` once the attempt is SUBMITTED or GRADED (a retake needs staff to reopen). Returns `StudentQuizDetail` without the answer key.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/StudentQuizDetail" }, "The open attempt."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`quiz_not_published` or `attempt_closed`."),
      },
    },
    patch: {
      tags: ["Quizzes"],
      summary: "Save a batch of answers",
      description:
        "STUDENT only, with an ACTIVE enrolment in the quiz's season (403 otherwise; 404 for an unknown quiz). Upserts one answer per question into the open attempt (1-100 per call); saving never grades. Validation, all-or-nothing before any write: 400 `question_not_in_quiz`; 400 `wrong_answer_type` (text on an MCQ, or an option index on an ESSAY); 400 `answer_out_of_range` (`selectedIndex` must be below **that question's** option count). 409 `no_attempt` if the quiz was never started; 409 `attempt_closed` once submitted.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["answers"],
              properties: {
                answers: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: {
                    type: "object",
                    required: ["questionId"],
                    properties: {
                      questionId: { type: "integer", minimum: 1 },
                      selectedIndex: { type: ["integer", "null"], minimum: 0 },
                      text: { type: ["string", "null"], maxLength: 20000 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", required: ["saved"], properties: { saved: { type: "integer" } } },
          "How many answers were saved.",
        ),
        400: conflict("`bad_request`, `question_not_in_quiz`, `wrong_answer_type` or `answer_out_of_range`."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`no_attempt` or `attempt_closed`."),
      },
    },
  },
  "/api/v1/quizzes/{id}/attempt/submit": {
    post: {
      tags: ["Quizzes"],
      summary: "Submit the open attempt",
      description:
        "STUDENT only, with an ACTIVE enrolment in the quiz's season (403 otherwise). Every question must be answered (409 `attempt_incomplete`; an essay must be non-blank). MCQs are scored all-or-nothing against the key, read, scored and written inside ONE transaction that holds a row lock on the attempt (REG-111) — a concurrent answer save or second submit waits and then gets 409 `attempt_closed`. A quiz with an ESSAY becomes `SUBMITTED` with `autoScore` set and no `totalScore` (a human must grade it, and nobody is notified). An all-MCQ quiz becomes `GRADED` immediately, `gradedById` stays null, and one `QUIZ_GRADED` notification (link `/student/quizzes`, v1's format) is created best-effort. 409 `attempt_closed` on a second submit. Returns `StudentQuizDetail`, now with `isCorrect`/`pointsAwarded` per MCQ but never the key.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/StudentQuizDetail" }, "The submitted attempt."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`no_attempt`, `attempt_closed` or `attempt_incomplete`."),
      },
    },
  },

  "/api/v1/quizzes/{id}/attempts": {
    get: {
      tags: ["Quizzes"],
      summary: "The grading list for an ONLINE quiz",
      description:
        "Staff with a scope in the quiz's season (SUPER, season admin, leader of a group in it). **The student set is derived on the server** from the caller's scope (a leader sees only their own groups' ACTIVE enrolments) and is never accepted from the client. Pages over that set by student id (`cursor` = last student id of the previous page). `items` holds each student's latest attempt when it is SUBMITTED or GRADED, with the answer key (grader audience). `waiting` lists students with no gradable attempt — never started, or latest attempt still IN_PROGRESS (including one just reopened) — so nobody vanishes from the screen.",
      parameters: [
        idParam,
        { name: "cursor", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
      ],
      responses: {
        200: ok({ $ref: "#/components/schemas/QuizGradingPage" }, "One page of the grading list."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/quizzes/{id}/attempts/{attemptId}/grade": {
    post: {
      tags: ["Quizzes"],
      summary: "Mark an attempt's essay answers",
      description:
        "Staff with a scope in the season; the attempt's student must be in the caller's own student set (403 `student_not_in_scope`), and the attempt must belong to this quiz (404). 409 `attempt_not_submitted` for an IN_PROGRESS attempt. `awards` must name **every** ESSAY question exactly once (400 `awards_incomplete`) and each award may not exceed that question's points (400 `score_exceeds_max` — rejected, not clamped). Sets `manualScore` = sum of awards, `totalScore` = stored `autoScore` + `manualScore`, status GRADED, `gradedById` = caller. The student gets a `QUIZ_GRADED` notification on a first grade or whenever the total changes; an identical re-save is silent. The response carries `answers: []` — refetch the list for the recomputed page.",
      parameters: [idParam, { name: "attemptId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["awards"],
              properties: {
                awards: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    required: ["questionId", "points"],
                    properties: {
                      questionId: { type: "integer", minimum: 1 },
                      points: { type: "integer", minimum: 0 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/QuizGradingAttempt" }, "The graded attempt (with an empty `answers`)."),
        400: conflict("`bad_request`, `awards_incomplete` or `score_exceeds_max`."),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` or `student_not_in_scope`."),
        404: errRef("NotFound"),
        409: conflict("`attempt_not_submitted`."),
      },
    },
  },
  "/api/v1/quizzes/{id}/attempts/reopen": {
    post: {
      tags: ["Quizzes"],
      summary: "Grant a student a retake",
      description:
        "**A leader power, not admin-only:** any staff with a scope in the season may reopen, for a student in their own student set (403 `student_not_in_scope`). Creates a new attempt (`attemptNumber` + 1, IN_PROGRESS); earlier attempts and answers are preserved. 409 `quiz_not_published` (PAPER or unpublished), `no_attempt` (never attempted), `attempt_open` (latest attempt is already IN_PROGRESS). The student is notified (reusing `QUIZ_GRADED` with retake copy, link `/student/quizzes`).",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["studentUserId"],
              properties: { studentUserId: { type: "integer", minimum: 1 } },
            },
          },
        },
      },
      responses: {
        201: ok(
          {
            type: "object",
            required: ["attemptId", "attemptNumber"],
            properties: { attemptId: { type: "integer" }, attemptNumber: { type: "integer" } },
          },
          "The new attempt.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` or `student_not_in_scope`."),
        404: errRef("NotFound"),
        409: conflict("`quiz_not_published`, `no_attempt` or `attempt_open`."),
      },
    },
  },

  "/api/v1/quizzes/{id}/grades": {
    get: {
      tags: ["Quizzes"],
      summary: "The PAPER grade sheet",
      description:
        "Staff with a scope in the quiz's season. One row per live student in the caller's server-derived student set (a leader: their own groups' enrolments; everyone means the season's participants (ACTIVE; in a finished season also COMPLETED; never WITHDRAWN); admin/SUPER: the whole season), name-ordered, with `score`/`notes` null for ungraded students and `gradedByName` as the audit trail.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/QuizGradeSheet" }, "The sheet."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    post: {
      tags: ["Quizzes"],
      summary: "Save PAPER grades in one batch",
      description:
        "Replaces v1's `saveQuizGradesAction`, which was unscoped twice over. (1) **One gate for every role:** any staff with a scope in *this quiz's season* (v1 checked the season only for LEADERs, so an ADMIN of any other season could write grades anywhere) — 403 `forbidden`. (2) **The student set is server-derived**, and every entry must be inside it: **the whole batch is rejected, nothing written,** with 403 `student_not_in_scope` if any entry is not (v1 upserted whatever ids it was sent). (3) **Atomic:** all upserts/deletes run in one transaction, and a score above the quiz's `maxScore` rejects the whole batch with 400 `score_exceeds_max` (not clamped). `score: null` **clears** that student's grade. A PAPER-only route: 409 `wrong_quiz_kind` for an ONLINE quiz. Students are notified (`QUIZ_GRADED`) only for a first grade or a changed score. Returns the sheet after the write.\n\nThere is deliberately no `DELETE /quizzes/{id}`.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["entries"],
              properties: {
                entries: {
                  type: "array",
                  minItems: 1,
                  maxItems: 200,
                  items: {
                    type: "object",
                    required: ["studentUserId", "score"],
                    properties: {
                      studentUserId: { type: "integer", minimum: 1 },
                      score: { type: ["integer", "null"], minimum: 0, description: "Null clears the grade." },
                      notes: { type: ["string", "null"], maxLength: 1000 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/QuizGradeSheet" }, "The sheet after the write."),
        400: conflict("`bad_request` or `score_exceeds_max`."),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` or `student_not_in_scope`."),
        404: errRef("NotFound"),
        409: conflict("`wrong_quiz_kind`."),
      },
    },
  },
} as const;
