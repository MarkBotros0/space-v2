import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";
import { notificationPaths } from "./notifications";

/** Notes, notifications, devices and engagement. Assembled into the document by `../openapi.ts`. */
export const notesNotificationsPaths = {
  "/api/v1/students/{id}/notes": {
    get: {
      tags: ["Notes"],
      summary: "Notes about one student, narrowed to what the caller may read",
      description:
        "Pastoral records \u2014 sensitive. Two gates, in order: the caller must be able to view the student (`canViewStudent`), then the visibility rule is applied **in the query**, so a hidden note never leaves the database. Visibility is **equality**, not a ladder: a LEADER reads LEADERS notes, a MENTOR MENTORS, an ADMIN ADMINS, SUPER reads all, and every author reads their own regardless of visibility. An ADMIN therefore does not read a LEADERS note. An ADMIN or LEADER also reads nothing filed under a season they don't serve in now, their own notes included; a note with no season keeps these rules, and SUPER and MENTOR read every season. A STUDENT receives `403 forbidden` \u2014 never an empty list, even for their own notes. `body` is plain text, not the HTML the column holds. Newest first, cursor-paged (`nextCursor` is opaque; pass it back as `cursor`). Rate-limited; each read writes a server-side audit line (viewer id, student id, count \u2014 never a body).",
      parameters: [
        idParam,
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        {
          name: "withinDays",
          in: "query",
          description: "Only notes written in the last N days (the mentor's This week is 7).",
          schema: { type: "integer", minimum: 1, maximum: 365 },
        },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["notes", "nextCursor"],
            properties: {
              notes: { type: "array", items: { $ref: "#/components/schemas/NoteSummary" } },
              nextCursor: { type: ["string", "null"] },
            },
          },
          "A page of visible notes.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        429: errRef("TooManyRequests"),
      },
    },
    post: {
      tags: ["Notes"],
      summary: "Write a note about a student",
      description:
        "Writer gate, independent of the read path: SUPER and MENTOR for any student; ADMIN if the student is enrolled in a season they administer; LEADER if the student's `SeasonEnrollment.groupId` is a group they lead; STUDENT never (including about themselves). `body` is **plain text in both directions**: the API escapes and paragraph-wraps it for storage (the column is still rendered raw by v1) and strips tags on read, so no live markup is ever stored or returned. `visibility` and `followUpFlagged` are immutable after creation. `authorUserId` always comes from the session. `seasonId` is optional; omitted, it defaults to the student's most recent ACTIVE enrollment, and when given it must be a season the student is enrolled in (`400 season_not_enrolled`). An ADMIN or LEADER files only under a season they serve in now: a named season outside that is 403, and the default is their newest enrollment of the student there, an ACTIVE one first. A flagged note notifies nobody (owner, 2026-11-07): `followUpFlagged` is recorded on the note for staff to read, and `MENTOR_FOLLOWUP` is no longer sent.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["body", "visibility"],
              properties: {
                body: { type: "string", minLength: 2, maxLength: 20000, description: "Plain text." },
                visibility: { $ref: "#/components/schemas/NoteVisibility" },
                followUpFlagged: { type: "boolean", default: false },
                seasonId: { type: "integer", minimum: 1 },
              },
            },
          },
        },
      },
      responses: {
        201: ok(
          { type: "object", required: ["note"], properties: { note: { $ref: "#/components/schemas/NoteSummary" } } },
          "The created note.",
        ),
        400: conflict("`bad_request` or `season_not_enrolled`."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },

  "/api/v1/notes/{id}": {
    patch: {
      tags: ["Notes"],
      summary: "Correct a note's body (author only)",
      description:
        "Author equality: **SUPER is not exempt**. An ADMIN or LEADER can't edit a note filed under a season they no longer serve in (403), as they can't read it. Body only \u2014 `visibility`, `followUpFlagged` and `seasonId` are immutable, and extra fields are ignored. The body has the same 2\u201320000 bound as create (v1 validated nothing). `body` is plain text in both directions. The response's `edited` becomes true.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["body"],
              properties: { body: { type: "string", minLength: 2, maxLength: 20000, description: "Plain text." } },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", required: ["note"], properties: { note: { $ref: "#/components/schemas/NoteSummary" } } },
          "The updated note.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    delete: {
      tags: ["Notes"],
      summary: "Delete a note (not available)",
      description:
        "Always `501 delete_unavailable`; nothing is deleted. v1's delete was a hard delete with no UI caller; soft delete needs a `deletedAt` column, which Note does not have. Correct a note by editing it.",
      parameters: [idParam],
      responses: {
        401: errRef("Unauthorized"),
        501: conflict("`delete_unavailable`."),
      },
    },
  },

  ...notificationPaths,
  "/api/v1/me/notes": {
    get: {
      tags: ["Notes"],
      summary: "Notes the caller wrote",
      description:
        "Open to every authoring role (SUPER, ADMIN, LEADER, MENTOR); a STUDENT receives `403 forbidden`. Narrowed by author equality in the query, and for an ADMIN or LEADER to notes with no season or in a season they serve in now. Optional `studentId` filters to one student. `body` is plain text. Cursor-paged, newest first. Rate-limited.",
      parameters: [
        { name: "studentId", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        {
          name: "withinDays",
          in: "query",
          description: "Only notes written in the last N days (the mentor's This week is 7).",
          schema: { type: "integer", minimum: 1, maximum: 365 },
        },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["notes", "nextCursor"],
            properties: {
              notes: { type: "array", items: { $ref: "#/components/schemas/AuthoredNote" } },
              nextCursor: { type: ["string", "null"] },
            },
          },
          "A page of the caller's own notes.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        429: errRef("TooManyRequests"),
      },
    },
  },

  "/api/v1/me/visible-notes": {
    get: {
      tags: ["Notes"],
      summary: "Newest notes a mentor may read, across students",
      description:
        "MENTOR only; every other role receives `403 forbidden`. Narrowed in the query by the note visibility rule (the mentor's own notes plus those visible to mentors); notes of soft-deleted students are omitted. Rows are `AuthoredNote` (carry `student`). `body` is plain text. Cursor-paged, newest first. Read-only. Rate-limited; each read is audit-logged with ids and a count only.",
      parameters: [
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        {
          name: "withinDays",
          in: "query",
          description: "Only notes written in the last N days (the mentor's This week is 7).",
          schema: { type: "integer", minimum: 1, maximum: 365 },
        },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["notes", "nextCursor"],
            properties: {
              notes: { type: "array", items: { $ref: "#/components/schemas/AuthoredNote" } },
              nextCursor: { type: ["string", "null"] },
            },
          },
          "A page of visible notes.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        429: errRef("TooManyRequests"),
      },
    },
  },

  "/api/v1/students/{id}/engagement": {
    get: {
      tags: ["Notes"],
      summary: "One student's engagement in one season",
      description:
        "Computed on the server from a single definition; clients never recompute the score or the at-risk flag. Two gates: the caller must be able to view the student, **and** must be scoped to the season being scored (a season admin of season A cannot read the student's season-B numbers; a leader must lead the student's group in that season; SUPER and MENTOR read any). `seasonId` selects the season, else the newest ACTIVE enrollment the caller is scoped to. **Staff** receive `StudentEngagementDetail` (composite, `atRisk` and the student's quizzes given and taken). **A student asking about themselves** receives `StudentSelfEngagement`: the two components and **no `score` and no `atRisk`** (deliberate). The attendance denominator counts past sessions at or after the student's own enrollment date (a deliberate divergence from v1, which counted the whole season); a zero denominator never flags. The score counts PRESENT and LATE attendance rows and does **not** read `lateMinutes`, so it is unaffected by the lateness-instant defect (ruling C3) that the absence-budget figures in the attendance domain inherit.",
      parameters: [idParam, { name: "seasonId", in: "query", schema: { type: "integer", minimum: 1 } }],
      responses: {
        200: ok(
          {
            oneOf: [
              { $ref: "#/components/schemas/StudentEngagementDetail" },
              { $ref: "#/components/schemas/StudentSelfEngagement" },
            ],
          },
          "Staff arm or the student's own arm, by caller role.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`no_season` (no enrollment to score) or `not_found`."),
      },
    },
  },
} as const;
