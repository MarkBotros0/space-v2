import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** Quiz attempts, grading and grades. Assembled into the document by `../openapi.ts`. */
export const quizAttemptsPaths = {
  "/api/v1/quizzes/{id}/attempt": {
    put: {
      tags: ["Quizzes"],
      summary: "Start or resume the caller's attempt",
      description:
        "STUDENT only (staff get 403), with an ACTIVE enrolment in the quiz's season — a withdrawn or completed student, or an alumnus who isn't studying in it, gets 403 (the same gate applies to save and submit). Idempotent create-or-resume: the first call creates attempt 1 (an upsert on the natural key, so concurrent calls cannot create two); later calls return the same attempt. The attempt is addressed by quiz, never by attempt id. 409 `quiz_not_published` if the quiz is PAPER or unpublished; 409 `quiz_not_open_yet` before the start window opens and `quiz_start_closed` after it closes (a first start only; an attempt already begun, and a retake, are not blocked by the window); 409 `attempt_closed` once the attempt is SUBMITTED or GRADED (a retake needs staff to reopen). Returns `StudentQuizDetail` without the answer key: the questions in this attempt's own shuffle (fixed for the life of the attempt; a retake gets a new one), options and matching columns shuffled, true/false not.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/StudentQuizDetail" }, "The open attempt."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`quiz_not_published`, `quiz_not_open_yet`, `quiz_start_closed` or `attempt_closed`."),
      },
    },
    patch: {
      tags: ["Quizzes"],
      summary: "Save a batch of answers",
      description:
        "STUDENT only, with an ACTIVE enrolment in the quiz's season (403 otherwise; 404 for an unknown quiz). Upserts one answer per question into the open attempt (1-100 per call); saving never grades. Answers are by identity (option, item and blank ids), never by position, one `QuizAnswerInput` shape per question type. Validation, all-or-nothing before any write: 400 `question_not_in_quiz`; 400 `wrong_answer_type` (the answer's type does not fit the question); 400 `answer_out_of_range` (an option, item or blank id that is not part of **that question**); 400 `too_many_choices` (\"Choose at most N.\" on a multiple-choice question). 409 `no_attempt` if the quiz was never started; 409 `attempt_closed` once submitted.",
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
                  items: { $ref: "#/components/schemas/QuizAnswerInput" },
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
        400: conflict(
          "`bad_request`, `question_not_in_quiz`, `wrong_answer_type`, `answer_out_of_range` or `too_many_choices`.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict(
          "`no_attempt`, `attempt_not_started` (a timed attempt whose clock has not started: start it first) or `attempt_closed` (including one that just timed out; saves land up to 10 s after the deadline).",
        ),
      },
    },
  },
  "/api/v1/quizzes/{id}/attempt/submit": {
    post: {
      tags: ["Quizzes"],
      summary: "Submit the open attempt",
      description:
        'STUDENT only, with an ACTIVE enrolment in the quiz\'s season (403 otherwise). Every question must be answered (409 `attempt_incomplete`): a choice needs a pick (at least one tick on multiple choice), matching needs every left item paired, each blank non-empty, an essay non-blank. Single-choice, multiple-choice, true/false and matching questions are scored by the server inside ONE transaction that holds a row lock on the attempt (REG-111), so a concurrent answer save or second submit waits and then gets 409 `attempt_closed`. Multiple choice earns 1/N of the points per correct tick and a wrong tick costs nothing; matching earns 1/pairs per correct pair. An attempt with a FILL_BLANK or ESSAY question becomes `SUBMITTED` with `autoScore` set until a leader marks it, and nobody is notified. Otherwise it becomes `GRADED` immediately, `gradedById` stays null, and one `QUIZ_GRADED` notification, "Your score is in", is created best-effort. Scores are decimals to 2 places. 409 `attempt_closed` on a second submit. Returns `StudentQuizDetail` at the resulting `stage`: a handed-in attempt shows no questions and no answers, and a graded one shows its score only, until the answers are released',
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/StudentQuizDetail" }, "The submitted attempt."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict(
          "`no_attempt`, `attempt_not_started`, `attempt_closed` or `attempt_incomplete` (a timed-out attempt is closed with what was saved and skips the completeness rule).",
        ),
      },
    },
  },
  "/api/v1/quizzes/{id}/attempt/events": {
    post: {
      tags: ["Quizzes"],
      summary: "Report exits from the open attempt",
      description:
        "STUDENT only, with an ACTIVE enrolment in the quiz's season (403 otherwise; 404 for an unknown quiz); the caller's own latest attempt, addressed by quiz. 1-20 events per call, each with a client UUID `clientEventId`: an `(attempt, clientEventId)` pair is stored once, so a retry or an offline replay never counts twice. `EXIT` and `RELAUNCH` count towards the limit of 3; `SCREENSHOT` is logged only. The report that brings the count to 3 ends the attempt in the same transaction as the insert, under the attempt's row lock: it is marked like a submit with what is saved, `endReason` ENDED_BY_EXITS, and a GRADED close sends one \"Your score is in\" after the commit. On an attempt that is not IN_PROGRESS (submitted, graded, timed out, ended) nothing is stored and the call still answers 200 with `ended: false`; one past its deadline (+ the 10 s save grace) is closed TIMED_OUT first and then treated the same. The body names the attempt the phone saw (`attemptId`, from the student detail): events for any attempt other than the caller's latest (queued for an earlier one, replayed onto a retake) are dropped, neither stored nor counted, and the answer reflects the latest attempt. The phone's clock never loses an exit: a `leftAt` or `returnedAt` later than the server's now is stored as now, and one more than 24 h before the attempt's creation as that bound. A timed attempt whose clock has not started (reopened, before the start PUT) stores nothing either: it shows no questions. Returns the server's count (`exits`, never shown to the student), whether this call ended the attempt, and its status; no answer data. 400 `bad_request` when a `returnedAt` is before its `leftAt`.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["attemptId", "events"],
              properties: {
                attemptId: { type: "integer", minimum: 1 },
                events: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    required: ["clientEventId", "kind", "leftAt", "returnedAt"],
                    properties: {
                      clientEventId: { type: "string", format: "uuid" },
                      kind: { type: "string", enum: ["EXIT", "RELAUNCH", "SCREENSHOT"] },
                      leftAt: { type: "string", format: "date-time" },
                      returnedAt: { type: ["string", "null"], format: "date-time" },
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
          {
            type: "object",
            required: ["exits", "ended", "status"],
            properties: {
              exits: { type: "integer" },
              ended: { type: "boolean" },
              status: { type: "string", enum: ["IN_PROGRESS", "SUBMITTED", "GRADED"] },
            },
          },
          "The server's exit count.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`no_attempt`."),
      },
    },
  },

  "/api/v1/quizzes/{id}/live": {
    get: {
      tags: ["Quizzes"],
      summary: "The live screen: where every student in scope is",
      description:
        "Staff only (SUPER, season admin, leader of a group in the season; a leader sees only their groups). Closes the quiz's expired attempts first, then returns each student's latest attempt as a state with the exit count. Carries no answer content. Polled by the app every few seconds.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/QuizLive" }, "Every student in scope with their state."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },

  "/api/v1/quizzes/{id}/attempts": {
    get: {
      tags: ["Quizzes"],
      summary: "The grading list for an ONLINE quiz",
      description:
        "Staff with a scope in the quiz's season (SUPER, season admin, leader of a group in it). **The student set is derived on the server** from the caller's scope (a leader sees only their own groups' ACTIVE enrolments) and is never accepted from the client. Pages over that set by student id (`cursor` = last student id of the previous page). `items` holds each student's latest attempt when it is SUBMITTED or GRADED, with the answer key (grader audience) and, for fill-in-the-blank, each blank beside its expected answer. `waiting` lists students with no gradable attempt — never started, or latest attempt still IN_PROGRESS (including one just reopened) — so nobody vanishes from the screen.",
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
      summary: "Mark an attempt's blanks and essays",
      description:
        "Staff with a scope in the season, which includes the season admin and a super (anything a leader can do, they can); the attempt's student must be in the caller's own student set (403 `student_not_in_scope`), and the attempt must belong to this quiz (404). 409 `attempt_not_submitted` for an IN_PROGRESS attempt. The body is right or wrong, never points: one mark per FILL_BLANK blank and one per ESSAY question, and the set must be complete (409 `marks_incomplete`) with every mark naming a real blank or essay of this quiz (400 `mark_out_of_range`). Each right blank earns 1/blanks of its question's points; a right essay earns all of them. Sets `manualScore`, `totalScore` = stored `autoScore` + `manualScore` (decimals to 2 places), status GRADED, `gradedById` = caller. Re-marking is allowed. The student gets a \"Your score is in\" `QUIZ_GRADED` notification on a first grade or whenever the total changes; an identical re-save is silent. The response carries `answers: []` — refetch the list for the recomputed page",
      parameters: [idParam, { name: "attemptId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/MarkAttemptRequest" },
          },
        },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/QuizGradingAttempt" }, "The graded attempt (with an empty `answers`)."),
        400: conflict("`bad_request` or `mark_out_of_range`."),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` or `student_not_in_scope`."),
        404: errRef("NotFound"),
        409: conflict("`attempt_not_submitted` or `marks_incomplete`."),
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

  "/api/v1/quizzes/{id}/attempts/end": {
    post: {
      tags: ["Quizzes"],
      summary: "End a student's open attempt",
      description:
        "Staff with a scope in the season (leader, season admin, SUPER); the student must be in the caller's own student set (403 `student_not_in_scope`). Closes the student's latest attempt, which must be IN_PROGRESS (a timed attempt the student has not started yet counts): it is marked like a submit with what is saved and unanswered counts 0, `endReason` ENDED_BY_STAFF and `endedById` the caller. An attempt already past its deadline (+ the 10 s save grace) is closed as TIMED_OUT instead and answers 200 with that attempt (its `endReason` stays TIMED_OUT, `endedById` null). 409 `no_attempt` (never attempted) or `attempt_closed` (SUBMITTED, GRADED or closed by someone else first).",
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
        200: ok(
          {
            type: "object",
            required: ["attemptId", "status"],
            properties: { attemptId: { type: "integer" }, status: { type: "string", enum: ["SUBMITTED", "GRADED"] } },
          },
          "The closed attempt.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` or `student_not_in_scope`."),
        404: errRef("NotFound"),
        409: conflict("`no_attempt` or `attempt_closed`."),
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
                      score: {
                        type: ["number", "null"],
                        minimum: 0,
                        multipleOf: 0.01,
                        description: "At most two decimals. Null clears the grade.",
                      },
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
