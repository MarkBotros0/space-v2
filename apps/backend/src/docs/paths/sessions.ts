import { conflict, errRef, errorResponse, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/sessions/*` (attendance and check-in). Assembled into the document by `../openapi.ts`. */
export const sessionPaths = {
  "/api/v1/sessions": {
    post: {
      tags: ["Sessions"],
      summary: "Create a session or weekly series",
      description:
        "Season-admin power. `repeatWeeks` (1–26; v1 clamped silently, v2 refuses) creates that many sessions one calendar week apart **in the organisation timezone** (ORG_TIMEZONE), so the wall-clock time holds across DST; they share a fresh recurrenceGroupId. Creation lives here with `seasonId` in the body, not under /seasons/:id, so the season and session write workstreams never share a route file — do not move it.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["seasonId", "title", "durationMinutes"],
              properties: {
                seasonId: { type: "integer" },
                title: { type: "string", minLength: 2, maxLength: 120 },
                startsAt: { type: "string", format: "date-time", description: "An instant. Send this OR startDay + startTime, never both." },
                startDay: { type: "string", description: "YYYY-MM-DD on the org calendar. Org wall-clock start (D-16.6, Plan 5's day/time split); send exactly one of startsAt, or startDay + startTime." },
                startTime: { type: "string", description: "HH:mm on the org clock. Pair of startDay." },
                durationMinutes: { type: "integer", minimum: 15, maximum: 600 },
                location: { type: ["string", "null"], maxLength: 200 },
                youtubeUrl: { type: ["string", "null"], format: "uri" },
                description: { type: ["string", "null"], maxLength: 2000 },
                repeatWeeks: { type: "integer", minimum: 1, maximum: 26, default: 1 },
              },
            },
          },
        },
      },
      responses: {
        201: ok(
          { type: "object", properties: { id: { type: "integer" }, recurrenceGroupId: { type: ["string", "null"] } } },
          "Created; `id` is the first session.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    get: {
      tags: ["Sessions"],
      summary: "Calendar sessions across seasons, windowed",
      description:
        "Season set by role: SUPER all ACTIVE seasons (or any one live season via seasonId); ADMIN their seasons; LEADER every season they lead a group in; STUDENT/MENTOR 403. seasonId narrows within that set and is 403 outside it. Window [from, to) defaults to org-midnight today + 8 calendar weeks; one bound alone extends 8 weeks; span ≤ 120 days. checkInToken only on rows of seasons the caller administers.",
      parameters: [
        { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "seasonId", in: "query", schema: { type: "integer" } },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              sessions: { type: "array", items: { $ref: "#/components/schemas/SessionListItem" } },
              from: { type: "string", format: "date-time" },
              to: { type: "string", format: "date-time" },
              fromDayKey: { type: "string" },
              toDayKey: { type: "string" },
            },
          },
          "Sessions in the window.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/series": {
    get: {
      tags: ["Sessions"],
      summary: "Preview the sessions a scoped edit or delete would touch",
      description:
        "Season-admin only. Same season-fenced selection PATCH/DELETE use (C10). 'future' = the anchor and every sibling at or after its stored start. Totals are what DELETE refuses without force.",
      parameters: [idParam, { name: "scope", in: "query", required: true, schema: { type: "string", enum: ["one", "future", "all"] } }],
      responses: {
        200: ok({ type: "object" }, "The targets with dayKey, startTime, isAnchor, attendanceCount; totals attendanceCount, videoProgressCount."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/check-in": {
    get: {
      tags: ["Sessions"],
      summary: "Check-in state for the admin console",
      description: "Season-admin only. state ∈ not_open|open|expired|closed (lib/check-in.ts — the same rule the scan enforces); expiresAt/expiresAtTime only while open.",
      parameters: [idParam],
      responses: {
        200: ok({ type: "object" }, "The state."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/check-in-regenerate": {
    post: {
      tags: ["Sessions"],
      summary: "Replace the check-in token",
      description: "Season-admin only. Timestamps untouched: an open window stays open under the new code, and the old code is rejected with invalid_token (v1 R40).",
      parameters: [idParam],
      responses: {
        200: ok({ type: "object", properties: { checkInToken: { type: "string" } } }, "The new token."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/quizzes": {
    get: {
      tags: ["Sessions"],
      summary: "Quizzes linked to a session",
      description: "Season admins and leaders with a group in the season. Oldest first (v1 listQuizzesForSession).",
      parameters: [idParam],
      responses: {
        200: ok({ type: "object" }, "{ quizzes: [{ id, title, kind, maxScore, questionCount, publishedAt }] }"),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}": {
    get: {
      tags: ["Sessions"],
      summary: "Session detail",
      description:
        "A student sees the session only with an ACTIVE enrolment in its season; any other student (withdrawn, completed, never enrolled) gets 404 not_found, as v1 did (REG-77). Staff scoping unchanged (403 outside scope).",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/SessionDetail" }, "The session."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Sessions"],
      summary: "Edit a session, optionally its series",
      description:
        "Season-admin power. Full body plus `scope`: `one` (this session), `future` (this and later siblings), `all`. Series scopes shift every target by the anchor's start delta. The series is ALWAYS limited to this session's season (ruling C10 — v1 matched on recurrenceGroupId alone and could rewrite another season's sessions). A moved start notifies ACTIVE enrollees (SESSION_RESCHEDULED, link `/student/calendar`, time in ORG_TIMEZONE).",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["title", "durationMinutes", "scope"],
              properties: {
                title: { type: "string", minLength: 2, maxLength: 120 },
                startsAt: { type: "string", format: "date-time", description: "An instant. Send this OR startDay + startTime, never both." },
                startDay: { type: "string", description: "YYYY-MM-DD on the org calendar. Org wall-clock start (D-16.6, Plan 5's day/time split); send exactly one of startsAt, or startDay + startTime." },
                startTime: { type: "string", description: "HH:mm on the org clock. Pair of startDay." },
                durationMinutes: { type: "integer", minimum: 15, maximum: 600 },
                location: { type: ["string", "null"] },
                youtubeUrl: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
                scope: { type: "string", enum: ["one", "future", "all"] },
              },
            },
          },
        },
      },
      responses: {
        200: ok({ type: "object", properties: { updated: { type: "integer" } } }, "Updated."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    delete: {
      tags: ["Sessions"],
      summary: "Delete a session, optionally its series",
      description:
        "Season-admin power. Body `{ scope?: 'one'|'future'|'all' (default 'one'), force?: boolean }`; series fenced to this season (C10). Refused with 409 `has_student_records` when any target has attendance or video progress, unless `force: true`, which deletes those rows too. Also removed by cascade: the sessions' video questions. Kept with `sessionId` set to null: assignments and quizzes linked to them.",
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                scope: { type: "string", enum: ["one", "future", "all"], default: "one" },
                force: { type: "boolean", default: false },
              },
            },
          },
        },
      },
      responses: {
        200: ok({ type: "object", properties: { deleted: { type: "integer" } } }, "Deleted."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`has_student_records`."),
      },
    },
  },
  "/api/v1/sessions/{id}/attendance": {
    get: {
      tags: ["Sessions"],
      summary: "Attendance roster",
      description:
        "Staff only. The roster carries every enrolled student's name and email, so it is gated more tightly than session detail — a STUDENT who can read the session cannot read its roster.",
      parameters: [idParam],
      responses: {
        200: ok(
          { type: "object", properties: { roster: { type: "array", items: { $ref: "#/components/schemas/AttendanceRosterRow" } } } },
          "The roster.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    post: {
      tags: ["Sessions"],
      summary: "Mark attendance",
      description:
        "Upserts every entry in one transaction. `lateMinutes` is stored only when `status` is LATE; any other status clears it, and an omitted `notes` clears the column.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["entries"],
              properties: {
                entries: { type: "array", items: { $ref: "#/components/schemas/AttendanceEntry" } },
              },
            },
          },
        },
      },
      responses: {
        200: ok({ type: "object", properties: { saved: { type: "integer" } } }, "Entries written."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/sessions/{id}/check-in-open": {
    post: {
      tags: ["Sessions"],
      summary: "Open check-in and mint a token",
      description:
        "Season admins and SUPER only — not group leaders. Reopening reuses the existing token, so a code already displayed to a room stays valid.",
      parameters: [idParam],
      responses: {
        200: ok({ type: "object", properties: { checkInToken: { type: "string" } } }, "Check-in is open."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/{id}/check-in-close": {
    post: {
      tags: ["Sessions"],
      summary: "Close check-in",
      description: "Season admins and SUPER only.",
      parameters: [idParam],
      responses: {
        200: ok({ type: "object", properties: { closed: { type: "boolean" } } }, "Check-in is closed."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/sessions/check-in": {
    post: {
      tags: ["Sessions"],
      summary: "Student self check-in",
      description:
        "Marks the caller PRESENT, or LATE with the whole minutes elapsed since the session's start (ruling C3 — not since check-in opened). Check-in hard-stops three hours after opening even if never explicitly closed.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["token"],
              properties: { token: { type: "string", minLength: 1 } },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              status: { type: "string", enum: ["PRESENT", "LATE"] },
              minutesLate: { type: "integer", description: "Whole minutes after Session.startsAt; 0 when on time." },
            },
          },
          "Checked in.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: {
          description: "`not_enrolled` — you have no ACTIVE enrolment in this session's season.",
          content: { "application/json": { schema: errorResponse } },
        },
        404: {
          description: "`invalid_token` — no session carries this check-in token. Note this is 404, not 401.",
          content: { "application/json": { schema: errorResponse } },
        },
        409: {
          description:
            "`not_open` (check-in never opened), `closed` (explicitly closed, or more than three hours after opening), or `already_checked_in`.",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
  },

} as const;
