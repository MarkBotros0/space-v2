import { conflict, errRef, errorResponse, ok } from "../helpers";
import { idParam, publicIdParam } from "../shared/params";

/** Assignments and submissions. Assembled into the document by `../openapi.ts`. */
export const assignmentsSubmissionsPaths = {
  "/api/v1/assignments/{id}": {
    get: {
      tags: ["Assignments"],
      summary: "Assignment detail",
      description:
        "Staff need access to the season; a STUDENT needs an enrolment in it, of any status (an assignment is for the whole season, so there is no group to check). A student's response carries `my`, their own work on each part, and says `readOnly: true` unless they hold an ACTIVE enrolment in an ACTIVE season: a draft's roster reads, but can't submit yet.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "The assignment."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Assignments"],
      summary: "Replace an assignment",
      description:
        "Season admins of the assignment's season (SUPER passes). A full replace of the fields and the parts, in one transaction; the season never changes (any `seasonId` in the body is ignored). Wording, dates and the reminder change freely after students have started (v1 R72). An edit that changes students' work answers 409 `needs_confirmation` with `students` (each student once) and writes nothing, until re-sent with `confirm: true`: removing a part (its work goes), changing a video's link to another video (its watch progress and answers go), changing an essay's word range once a student has work on it (applied as an update: essays already handed in stay handed in), or adding a part (whoever had submitted is reopened: `submittedAt` and `completedAt` cleared). Nobody is notified. A soft-deleted assignment is 404.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
      },
      responses: {
        200: ok(
          {
            allOf: [
              { $ref: "#/components/schemas/AssignmentDetail" },
              { type: "object", properties: { reopened: { type: "integer" } } },
            ],
          },
          "Saved: the assignment as GET returns it to staff, and `reopened`, the students whose submitted work went back to To do.",
        ),
        400: conflict("`bad_request` or `unknown_part`."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`needs_confirmation`, with `students` beside `error`."),
      },
    },
    delete: {
      tags: ["Assignments"],
      summary: "Soft-delete an assignment nobody has started",
      description:
        "Season admins of the assignment's season. Designed rather than ported: v1's soft-delete action had no caller (ruling C12). Sets `deletedAt`; parts and any history stay. Refused with 409 `has_submissions` while any student has work on one of its parts (any status, drafts included); a Submission left with no part work (its part was removed) does not block — there is no force option. Notifies nobody. Deleting twice is 404. Returns 200 with `{ deleted: true }` (the response envelope), not 204.",
      parameters: [idParam],
      responses: {
        200: ok({ type: "object", properties: { deleted: { type: "boolean", enum: [true] } } }, "Deleted."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`has_submissions`."),
      },
    },
  },

  "/api/v1/assignments/{id}/progress": {
    get: {
      tags: ["Assignments"],
      summary: "Every student's work on each part",
      description:
        "Staff only, and scoped: a LEADER sees only students in the groups they lead; staff with the whole season see everyone. Gated the same way the attendance roster is, because the rows name students.\n\nThe population is the season's participants, so a student who has done nothing still appears. Each row has the student's work on every part, in order: how far into each video (`video.watchedSeconds` of `video.durationSeconds`, questions answered and correct), each essay's review status, whether the forum post is up. A draft essay or forum post is the student's alone and reads as NOT_STARTED.\n\nStudents who haven't submitted come first, then by name.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/AssignmentProgress" }, "The progress."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },

  "/api/v1/submissions": {
    get: {
      tags: ["Submissions"],
      summary: "A reviewer's queue",
      description:
        "Staff only. Lists **essays**, one item per student per essay, labelled with the assignment and the essay's question; a video's progress and a forum post are never items. A DRAFT never appears. Scoped to the caller: a LEADER sees essays from students enrolled in a group they lead **in that assignment's own season**; an ADMIN sees their seasons; SUPER and MENTOR see everything.\n\nv1's equivalent was unscoped and unpaginated. Cursor-paged here, in v1's order (REG-89): status ascending (SUBMITTED first, then REVIEWED, RETURNED), then most recently handed in. The response carries `counts` for the header.",
      parameters: [
        {
          name: "pendingOnly",
          in: "query",
          schema: { type: "string", enum: ["true", "false"], default: "true" },
          description: "Only essays awaiting a verdict. Defaults true — it is a queue.",
        },
        { name: "seasonId", in: "query", schema: { type: "integer" } },
        {
          name: "cursor",
          in: "query",
          schema: { type: "string" },
          description: "`nextCursor` from the previous page.",
        },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        },
      ],
      responses: {
        200: ok({ $ref: "#/components/schemas/SubmissionQueue" }, "A page of the queue."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },

  "/api/v1/assignments/{id}/parts/{partId}/essay": {
    put: {
      tags: ["Submissions"],
      summary: "Save the student's essay draft",
      description:
        "STUDENT only, with an ACTIVE enrolment in the assignment's season (staff, and a finished or dropped season's students, get 403). The part must be an essay of this live assignment (404). Saves the whole text; the first save makes the student's Submission and essay work, later saves reuse them, so the response's `publicId` is the essay's handle for its detail, files and hand-in.\n\nA save never hands the essay in and never changes its status: a draft stays a draft until the assignment's Submit, and a RETURNED essay stays returned until it is handed in again (`POST /submissions/{publicId}/hand-in`). A handed-in or reviewed essay is `409 submission_locked`. A draft is the student's alone: staff are told it does not exist.",
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "integer" } },
        { name: "partId", in: "path", required: true, schema: { type: "integer" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["text"],
              properties: { text: { type: "string", maxLength: 20000 } },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              publicId: { type: "string" },
              wordCount: { type: "integer" },
              reviewStatus: { $ref: "#/components/schemas/SubmissionStatus" },
            },
          },
          "Saved.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`submission_locked` — the essay is handed in (SUBMITTED) or REVIEWED."),
      },
    },
  },

  "/api/v1/assignments/{id}/submit": {
    post: {
      tags: ["Submissions"],
      summary: "Submit the assignment",
      description:
        "STUDENT only, with an ACTIVE enrolment in the assignment's season (403 otherwise); a live assignment (404). Allowed only when every part is done, videos included: otherwise `409 not_finished` with the reason the app shows, e.g. \"Finish Luke 15 talk (12 min left) and the forum post to submit\". A handed-in essay counts as done even if its word range changed since.\n\nThe draft essays are handed in with it (DRAFT → SUBMITTED) and reach the review queue. `completedAt` is set at once when there is no essay to review; otherwise when every essay is reviewed. A second Submit is `409 already_submitted` (a returned essay is handed in on its own). The leaders of the student's group in the season get one `SUBMISSION_RECEIVED` each, opening the first essay (`/leader/submissions/{publicId}`), or the assignment when it has none (best-effort).",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              submittedAt: { type: "string", format: "date-time" },
              completedAt: { type: ["string", "null"], format: "date-time" },
            },
          },
          "Submitted.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict(
          "`not_finished` — a part is left (the message says which); `already_submitted` — submitted before.",
        ),
      },
    },
  },

  "/api/v1/submissions/{publicId}/hand-in": {
    post: {
      tags: ["Submissions"],
      summary: "Hand a returned essay in again",
      description:
        "The author only (403 otherwise), with an ACTIVE enrolment in the season. Only a RETURNED essay (`409 not_returned` otherwise: the first hand-in is the assignment's Submit). The word count is the server's (`essayWordCount`: words of the plain text, as the app counts): outside the essay's range, or with no words, it is `400 word_range` with the count in the message, e.g. \"This is 142 words; it needs at least 150.\"\n\nThe essay becomes SUBMITTED, so only it re-enters the review queue; the student's other parts are untouched. When that leaves every part done, the assignment is submitted again (`Submission.submittedAt` set; `assignmentSubmitted: true`). The leaders of the student's group in the season get one `SUBMISSION_RECEIVED` each, naming the essay (link `/leader/submissions/{publicId}`; best-effort).",
      parameters: [publicIdParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              reviewStatus: { type: "string", enum: ["SUBMITTED"] },
              assignmentSubmitted: { type: "boolean" },
            },
          },
          "Handed in.",
        ),
        400: {
          description: "`word_range` — outside the essay's word range, or empty; the message says the count.",
          content: { "application/json": { schema: errorResponse } },
        },
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`not_returned` — the essay is a draft (Submit hands it in) or already handed in."),
      },
    },
  },

  "/api/v1/submissions/{publicId}/review": {
    post: {
      tags: ["Submissions"],
      summary: "Record a verdict on one essay",
      description:
        'Each essay is reviewed on its own. Gated on a check strictly narrower than the read gate: the author never reviews their own work, and a MENTOR reads every essay but reviews none.\n\n`reviewed` (feedback optional) sets the essay REVIEWED; once every essay of the student\'s assignment is reviewed (and it is submitted), the assignment is complete (`Submission.completedAt`). `return` needs a note (`400` "Say what to change" without one) and sets the essay RETURNED: the assignment is reopened (`submittedAt` and `completedAt` cleared) and the student\'s other parts stay as they are. A handed-in or reviewed essay can be judged; a returned one is with the student (`409 not_handed_in`).\n\nThe student is notified, best-effort (title `Feedback ready on "<assignment>"` as in v1; `<assignment> was returned for revision` when returned; no body) — a mail failure does not report the review as failed.',
      parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["action", "feedback"],
              properties: {
                action: { type: "string", enum: ["reviewed", "return"] },
                feedback: { type: ["string", "null"], maxLength: 20000, description: "Required for `return`." },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", properties: { reviewStatus: { type: "string", enum: ["REVIEWED", "RETURNED"] } } },
          "Recorded.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: {
          description:
            "No such essay, or it is a DRAFT — a draft exists only for its author, so it can be neither reviewed nor returned.",
          content: { "application/json": { schema: errorResponse } },
        },
        409: conflict("`not_handed_in` — the essay was returned and the student has not handed it in again."),
      },
    },
  },

  "/api/v1/submissions/{publicId}": {
    get: {
      tags: ["Submissions"],
      summary: "One essay",
      description:
        "`publicId` is the essay work's (an essay part of a live assignment; a forum post's or a video's work is 404). Readable by the author, the student's group leader, a season admin, SUPER and MENTOR. A peer student cannot read another's essay. A DRAFT is the student's unfinished work and exists only for its author: to anyone else — staff included — it is `404`, as if it did not exist (on this route, its files, hand-in and review alike). RETURNED is not a draft and stays visible. `text` and `feedback` are plain text (stored HTML is converted on read, ruling C11); `groupId`/`groupName` name the student's group in the assignment's season.",
      parameters: [publicIdParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/SubmissionDetail" }, "The essay."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/submissions/{publicId}/files": {
    post: {
      tags: ["Submissions"],
      summary: "Attach a file",
      description: [
        "**Currently disabled.** `ENABLE_UPLOADS` defaults to `false` while file and image",
        "handling moves to a CMS, so this returns `503 uploads_disabled` — refused before the",
        "request body is read, so a large upload costs the server nothing. Reading and deleting",
        "files already recorded are unaffected.",
        "",
        "When enabled: author only, ACTIVE enrolment in the season, and only while the",
        "essay is DRAFT or RETURNED (otherwise `409 submission_locked`). An essay with no `maxFileSizeMb`",
        "takes no files (`400`). The essay's own `maxFileSizeMb` and",
        "`allowedMimeCategories` are enforced after upload; a process-level ceiling",
        "(`MAX_UPLOAD_BYTES`, 25 MB by default) rejects anything larger before the handler runs.",
      ].join("\n"),
      parameters: [publicIdParam],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: { file: { type: "string", format: "binary" } },
            },
          },
        },
      },
      responses: {
        201: ok(
          {
            type: "object",
            properties: {
              file: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  originalName: { type: "string" },
                  mimeType: { type: "string" },
                  sizeBytes: { type: "integer" },
                },
              },
            },
          },
          "Stored.",
        ),
        400: {
          description:
            "`file_too_large`, `mime_not_allowed`, or `bad_request` (no file part, or the essay takes no files).",
          content: { "application/json": { schema: errorResponse } },
        },
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        503: {
          description:
            "`uploads_disabled` — `ENABLE_UPLOADS` is off. The current default; retry once uploads are re-enabled.",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
    delete: {
      tags: ["Submissions"],
      summary: "Remove an attached file",
      description:
        "Author only, with an ACTIVE enrolment in the season. The file must belong to this essay, and the essay must be DRAFT or RETURNED.",
      parameters: [
        publicIdParam,
        { name: "fileId", in: "query", required: true, schema: { type: "integer", minimum: 1 } },
      ],
      responses: {
        200: ok({ type: "object", properties: { deleted: { type: "boolean" } } }, "Deleted."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`submission_locked` — the essay is SUBMITTED or REVIEWED."),
      },
    },
  },
  "/api/v1/submissions/{publicId}/files/{fileId}": {
    get: {
      tags: ["Submissions"],
      summary: "Download an attached file",
      description: [
        "Streams the raw bytes — **this is the one endpoint whose success path is not the `{ data }` envelope.** Error paths still are.",
        "",
        "Gated by the same rule as reading the essay, so a season admin or the student's group leader can open handed-in work while a peer student cannot.",
        "",
        "Served as `Content-Disposition: attachment` because uploads are arbitrary user content; `Content-Type` is the recorded MIME type, never sniffed from the extension.",
      ].join("\n"),
      parameters: [
        publicIdParam,
        { name: "fileId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      ],
      responses: {
        200: {
          description: "The file.",
          headers: {
            "Content-Disposition": {
              schema: { type: "string" },
              description: "`attachment`, with RFC 5987 `filename*`.",
            },
            "Cache-Control": { schema: { type: "string", example: "private, max-age=3600" } },
          },
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: {
          description:
            "No such file, it belongs to another essay, it is on someone else's DRAFT, or the stored blob is missing.",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
  },
} as const;
