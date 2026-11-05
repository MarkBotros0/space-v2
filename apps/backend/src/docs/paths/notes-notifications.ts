import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** Notes, notifications, devices and engagement. Assembled into the document by `../openapi.ts`. */
export const notesNotificationsPaths = {
  "/api/v1/students/{id}/notes": {
    get: {
      tags: ["Notes"],
      summary: "Notes about one student, narrowed to what the caller may read",
      description:
        "Pastoral records \u2014 sensitive. Two gates, in order: the caller must be able to view the student (`canViewStudent`), then the visibility rule is applied **in the query**, so a hidden note never leaves the database. Visibility is **equality**, not a ladder: a LEADER reads LEADERS notes, a MENTOR MENTORS, an ADMIN ADMINS, SUPER reads all, and every author reads their own regardless of visibility. An ADMIN therefore does not read a LEADERS note. A STUDENT receives `403 forbidden` \u2014 never an empty list, even for their own notes. `body` is plain text, not the HTML the column holds. Newest first, cursor-paged (`nextCursor` is opaque; pass it back as `cursor`). Rate-limited; each read writes a server-side audit line (viewer id, student id, count \u2014 never a body).",
      parameters: [
        idParam,
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
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
        "Writer gate, independent of the read path: SUPER and MENTOR for any student; ADMIN if the student is enrolled in a season they administer; LEADER if the student's `SeasonEnrollment.groupId` is a group they lead; STUDENT never (including about themselves). `body` is **plain text in both directions**: the API escapes and paragraph-wraps it for storage (the column is still rendered raw by v1) and strips tags on read, so no live markup is ever stored or returned. `visibility` and `followUpFlagged` are immutable after creation. `authorUserId` always comes from the session. `seasonId` is optional; omitted, it defaults to the student's most recent ACTIVE enrollment, and when given it must be a season the student is enrolled in (`400 season_not_enrolled`). A flagged note notifies that season's admins (`MENTOR_FOLLOWUP`); the notification **deliberately carries no excerpt of the note** (title and link only), and a notification failure never fails the write.",
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
        "Author equality and nothing else: **SUPER is not exempt**. Body only \u2014 `visibility`, `followUpFlagged` and `seasonId` are immutable, and extra fields are ignored. The body has the same 2\u201320000 bound as create (v1 validated nothing). `body` is plain text in both directions. The response's `edited` becomes true.",
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

  "/api/v1/notifications": {
    get: {
      tags: ["Notifications"],
      summary: "The caller's notification inbox, newest first",
      description:
        "Returns only the caller's own rows (the user id comes from the token, never a parameter). **Performs no write** — it never marks anything read, however often the client refetches (ruling C6); use `POST /notifications/read`. Ordered by id descending; `nextCursor` is the id of the last row of the page, or null at the end. `unreadCount` is a real count over all of the caller's unread rows, not a filter over the page. `target` is derived from the stored v1 link in one server-side function.",
      parameters: [
        { name: "cursor", in: "query", required: false, schema: { type: "integer", minimum: 1 }, description: "`nextCursor` of the previous page." },
        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        { name: "unreadOnly", in: "query", required: false, schema: { type: "string", enum: ["true", "false"], default: "false" } },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["items", "nextCursor", "unreadCount"],
            properties: {
              items: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
              nextCursor: { type: ["integer", "null"] },
              unreadCount: { type: "integer", minimum: 0 },
            },
          },
          "One page of the inbox.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/notifications/unread-count": {
    get: {
      tags: ["Notifications"],
      summary: "The caller's unread notification count (the badge)",
      description: "A single count over the caller's own unread rows. Separate from the list so rendering a badge never fetches rows.",
      responses: {
        200: ok(
          { type: "object", required: ["unreadCount"], properties: { unreadCount: { type: "integer", minimum: 0 } } },
          "The unread count.",
        ),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/notifications/read": {
    post: {
      tags: ["Notifications"],
      summary: "Mark notifications read (the explicit write)",
      description:
        "Body is exactly one of `{ ids: number[] }` (1–200) or `{ all: true }`; both together, an empty `ids`, or any other key (including `userId`) is `400 bad_request`. **`ids` is not an ownership assertion**: the update is scoped to the caller's own unread rows, so another user's id updates nothing and counts as zero. Idempotent — already-read rows are skipped and keep their original `readAt`; `marked` is the number of rows this call changed.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              oneOf: [
                {
                  type: "object",
                  required: ["ids"],
                  additionalProperties: false,
                  properties: { ids: { type: "array", minItems: 1, maxItems: 200, items: { type: "integer", minimum: 1 } } },
                },
                {
                  type: "object",
                  required: ["all"],
                  additionalProperties: false,
                  properties: { all: { type: "boolean", enum: [true] } },
                },
              ],
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", required: ["marked"], properties: { marked: { type: "integer", minimum: 0 } } },
          "How many rows this call marked.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/me/notification-preferences": {
    get: {
      tags: ["Me"],
      summary: "Your notification preferences (all nine)",
      description:
        "Always returns all nine keys. A user with no stored row is opted in to everything — the row is created lazily on first save, so most users have none. The preference governs outbound channels only (email and push); the in-app inbox row is always written.",
      responses: {
        200: ok(
          { type: "object", required: ["preferences"], properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } } },
          "The caller's preferences.",
        ),
        401: errRef("Unauthorized"),
      },
    },
    put: {
      tags: ["Me"],
      summary: "Replace your notification preferences",
      description:
        "PUT, not PATCH: the body must carry all nine keys, so a partial body is `400 bad_request`. The row written is always the caller's (from the token); a `userId` in the body is ignored. Creates the row on first write.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/NotificationPreferences" } } },
      },
      responses: {
        200: ok(
          { type: "object", required: ["preferences"], properties: { preferences: { $ref: "#/components/schemas/NotificationPreferences" } } },
          "What was stored.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/me/devices": {
    post: {
      tags: ["Me"],
      summary: "Register this device for push",
      description:
        "Upserts the Expo push token and points it at the caller, so a phone handed to another user moves with the sign-in. Calling it again only refreshes `lastSeenAt`. The token is a credential: it is never logged or returned.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/DeviceRegistration" } } },
      },
      responses: {
        200: ok({ type: "object", required: ["registered"], properties: { registered: { type: "boolean", enum: [true] } } }, "Registered."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/devices/unregister": {
    post: {
      tags: ["Me"],
      summary: "Unregister a device (no sign-in needed)",
      description:
        "Deletes the registration for this Expo push token. Needs no sign-in: the token is the proof, and the app must be able to stop pushes after a forced sign-out, when its session is already dead. The token travels in the body because paths reach access logs. Idempotent and opaque: an unknown token answers the same 200. Rate-limited.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["token"],
              additionalProperties: false,
              properties: { token: { type: "string", minLength: 1, maxLength: 200 } },
            },
          },
        },
      },
      responses: {
        200: ok({ type: "object", required: ["unregistered"], properties: { unregistered: { type: "boolean", enum: [true] } } }, "Unregistered (or never registered)."),
        400: errRef("BadRequest"),
        429: errRef("TooManyRequests"),
      },
    },
  },
  "/api/v1/me/notes": {
    get: {
      tags: ["Notes"],
      summary: "Notes the caller wrote",
      description:
        "Open to every authoring role (SUPER, ADMIN, LEADER, MENTOR); a STUDENT receives `403 forbidden`. Narrowed by author equality in the query. Optional `studentId` filters to one student. `body` is plain text. Cursor-paged, newest first. Rate-limited.",
      parameters: [
        { name: "studentId", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "cursor", in: "query", schema: { type: "string" } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
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
        "Computed on the server from a single definition; clients never recompute the score or the at-risk flag. Two gates: the caller must be able to view the student, **and** must be scoped to the season being scored (a season admin of season A cannot read the student's season-B numbers; a leader must lead the student's group in that season; SUPER and MENTOR read any). `seasonId` selects the season, else the newest ACTIVE enrollment the caller is scoped to. **Staff** receive `StudentEngagement` (composite and `atRisk`). **A student asking about themselves** receives `StudentSelfEngagement`: the two components and **no `score` and no `atRisk`** (deliberate). The attendance denominator counts past sessions at or after the student's own enrollment date (a deliberate divergence from v1, which counted the whole season); a zero denominator never flags. The score counts PRESENT and LATE attendance rows and does **not** read `lateMinutes`, so it is unaffected by the lateness-instant defect (ruling C3) that the absence-budget figures in the attendance domain inherit.",
      parameters: [idParam, { name: "seasonId", in: "query", schema: { type: "integer", minimum: 1 } }],
      responses: {
        200: ok(
          { oneOf: [{ $ref: "#/components/schemas/StudentEngagement" }, { $ref: "#/components/schemas/StudentSelfEngagement" }] },
          "Staff arm or the student's own arm, by caller role.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`no_season` (no enrollment to score) or `not_found`."),
      },
    },
  },

  "/api/v1/seasons/{id}/engagement": {
    get: {
      tags: ["Notes"],
      summary: "Engagement for a season's whole cohort",
      description:
        "Staff only (STUDENT gets 403). Computed in a constant number of queries regardless of cohort size (v1 issued four per student). SUPER, MENTOR and the season's admins read every active enrollment; a LEADER is narrowed to the students in the groups they lead (naming another group via `groupId` is 403). `groupId` optionally restricts to one group. Each row carries the composite `score` and the single `atRisk` flag. The attendance denominator starts at each student's enrollment date; the score does not read `lateMinutes` (see `GET /students/{id}/engagement`).",
      parameters: [idParam, { name: "groupId", in: "query", schema: { type: "integer", minimum: 1 } }],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["students"],
            properties: { students: { type: "array", items: { $ref: "#/components/schemas/EngagementRow" } } },
          },
          "One row per active enrollment in scope.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },

} as const;
