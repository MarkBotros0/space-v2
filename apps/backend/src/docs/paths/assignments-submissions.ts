import { conflict, errRef, errorResponse, ok } from "../helpers";
import { idParam, publicIdParam } from "../shared/params";

/** Assignments and submissions. Assembled into the document by `../openapi.ts`. */
export const assignmentsSubmissionsPaths = {
  "/api/v1/assignments/{id}": {
    get: {
      tags: ["Assignments"],
      summary: "Assignment detail",
      description:
        "Season access alone is not enough: for a targeted assignment (`isAllGroups: false`), a STUDENT must also be in one of the targeted groups — resolved from their enrolment in *this* season, not from their current group membership.",
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
        "Season admins of the assignment's season (SUPER passes). A full replace — send every field; omitted optional fields are cleared, exactly like v1's edit form. Targeting is replaced in the same transaction. The season never changes (any `seasonId` in the body is ignored). Students newly targeted by the edit get ASSIGNMENT_CREATED (same text and link as create); students already targeted are not notified again. Editing is allowed after submissions exist (v1 R72). A soft-deleted assignment is 404.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "The updated assignment."),
        400: conflict("`bad_request`, `invalid_group`, or `invalid_session`."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    delete: {
      tags: ["Assignments"],
      summary: "Soft-delete an assignment nobody has started",
      description:
        "Season admins of the assignment's season. Designed rather than ported: v1's soft-delete action had no caller (ruling C12). Sets `deletedAt`; targets and any history stay. Refused with 409 `has_submissions` while any Submission row exists (any status, drafts included) — there is no force option. Notifies nobody. Deleting twice is 404. Returns 200 with `{ deleted: true }` (the response envelope), not 204.",
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

  "/api/v1/assignments/{id}/tracker": {
    get: {
      tags: ["Assignments"],
      summary: "Who was given this assignment, and what they have done about it",
      description:
        "Staff only, and scoped: a LEADER sees only students in the groups they lead. The rows carry every student's name and email, so this is gated the same way the attendance roster is rather than on season access.\n\nThe population comes from season enrolments, not from who happens to have a submission — a student who has done nothing still appears, which is the point of a tracker.\n\nRows are ordered by group name, then student name (v1's order, REG-84); students with no group come last.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/AssignmentTracker" }, "The tracker."),
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
        "Staff only. Scoped to the caller: a LEADER sees submissions from students enrolled in a group they lead **in that assignment's own season**; an ADMIN sees their seasons; SUPER and MENTOR see everything.\n\nv1's equivalent was unscoped and unpaginated — every submission the reader could reach, in one response. Cursor-paged here, in v1's order (REG-89): status ascending (SUBMITTED first, then REVIEWED, RETURNED), then most recently submitted. The response carries `counts` for the header.",
      parameters: [
        {
          name: "pendingOnly",
          in: "query",
          schema: { type: "string", enum: ["true", "false"], default: "true" },
          description: "Only submissions awaiting a verdict. Defaults true — it is a queue.",
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

  "/api/v1/submissions/by-assignment/{assignmentId}": {
    put: {
      tags: ["Submissions"],
      summary: "Start (or fetch) this student's submission for an assignment",
      description:
        "Idempotent: the first call creates a DRAFT, later calls return the same row untouched. Never overwrites saved work.\n\nThis exists because v1 created the row as a side effect of *rendering* the assignment page. A read that writes is wrong on its own terms, and React Query would make it far worse — it refetches on mount, on focus and on reconnect, so the write would fire every time the app is tabbed back to.\n\nSTUDENT only, with an ACTIVE enrolment in the assignment's season, and only for an assignment actually targeted at them.",
      parameters: [
        { name: "assignmentId", in: "path", required: true, schema: { type: "integer" } },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              publicId: { type: "string" },
              status: { $ref: "#/components/schemas/SubmissionStatus" },
            },
          },
          "The student's submission for this assignment.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`use_forum_endpoint` —A FORUM assignment is written only through `PUT /assignments/{id}/forum/response`."),
      },
    },
  },

  "/api/v1/submissions/{publicId}/review": {
    post: {
      tags: ["Submissions"],
      summary: "Record a verdict",
      description:
        "Gated on a check strictly narrower than the read gate: the author never reviews their own work, and a MENTOR reads every submission in the system but reviews none.\n\n`returnForRevision` produces `RETURNED` rather than `REVIEWED`. v1 had `RETURNED` in its vocabulary with no producer, so the only route back to editable was its accidental one, where saving a draft silently demoted a reviewed submission and dropped it out of the queue.\n\nThe student is notified, best-effort (title `Feedback ready on \"<assignment>\"` as in v1; `<assignment> was returned for revision` when returned; no body) — a mail failure does not report the review as failed.",
      parameters: [{ name: "publicId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["feedback"],
              properties: {
                feedback: { type: "string", maxLength: 20000 },
                returnForRevision: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              reviewed: { type: "boolean" },
              returnedForRevision: { type: "boolean" },
            },
          },
          "Recorded.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: {
          description:
            "`not_submitted` — a DRAFT that was never submitted cannot be marked REVIEWED. It can still be returned for revision.",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
  },

  "/api/v1/submissions/{publicId}": {
    get: {
      tags: ["Submissions"],
      summary: "Submission detail",
      description:
        "Readable by the author, the student's group leader, a season admin, SUPER and MENTOR. A peer student cannot read another's submission. `text` and `feedback` are plain text (stored HTML is converted on read, ruling C11); `groupId`/`groupName` name the student's group in the assignment's season.",
      parameters: [publicIdParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/SubmissionDetail" }, "The submission."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Submissions"],
      summary: "Save a draft or submit",
      description:
        "**Author only** — reading and writing are different rights, so a season admin who can read this submission still cannot edit it. The author must also hold an ACTIVE enrolment in the assignment's season (a withdrawn, completed or alumni student gets 403).\n\nOnly a DRAFT or RETURNED submission can be changed; a SUBMITTED or REVIEWED one is `409 submission_locked`, for a save and a submit alike — the way back to editable is a reviewer's `returnForRevision`. `submit: true` sets status SUBMITTED and stamps `submittedAt` (a submit that loses a race to another is `409 submission_locked`), and tells the leaders of the student's group in the assignment's season with one `SUBMISSION_RECEIVED` notification each (link `/leader/submissions/{publicId}`, target `submission`; season admins are not notified; best-effort). Omitting it saves the text, leaves the status alone and notifies nobody.\n\nSubmitting blank text with no attached file is `400 empty_submission` (v1's rule, REG-85); saving a blank draft stays legal.",
      parameters: [publicIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["text"],
              properties: {
                text: { type: "string", maxLength: 20000 },
                submit: { type: "boolean", default: false },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", properties: { saved: { type: "boolean" }, submitted: { type: "boolean" } } },
          "Saved.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict(
          "`use_forum_endpoint` — a FORUM assignment is written only through `PUT /assignments/{id}/forum/response`; `submission_locked` — the submission is SUBMITTED or REVIEWED.",
        ),
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
        "submission is DRAFT or RETURNED (otherwise `409 submission_locked`). The assignment's own `maxFileSizeMb` and",
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
          description: "`file_too_large`, `mime_not_allowed`, or `bad_request` (no file part).",
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
        "Author only, with an ACTIVE enrolment in the season. The file must belong to this submission, and the submission must be DRAFT or RETURNED.",
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
        409: conflict("`submission_locked` — the submission is SUBMITTED or REVIEWED."),
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
        "Gated by the same rule as reading the submission, so a season admin or the student's group leader can open submitted work while a peer student cannot.",
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
            "Content-Disposition": { schema: { type: "string" }, description: "`attachment`, with RFC 5987 `filename*`." },
            "Cache-Control": { schema: { type: "string", example: "private, max-age=3600" } },
          },
          content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        },
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: {
          description: "No such file, it belongs to another submission, or the stored blob is missing.",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
  },

} as const;
