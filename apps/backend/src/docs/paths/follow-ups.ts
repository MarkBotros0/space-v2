import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

const followUp = {
  type: "object",
  required: ["id", "studentUserId", "studentName", "reason", "createdAt", "dueAt", "remindedAt", "doneAt"],
  properties: {
    id: { type: "integer" },
    studentUserId: { type: "integer" },
    studentName: { type: "string" },
    reason: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    dueAt: { type: "string", format: "date-time", description: "7 days after `createdAt`." },
    remindedAt: { type: ["string", "null"], format: "date-time", description: "When the one reminder went." },
    doneAt: { type: ["string", "null"], format: "date-time", description: "Null while open." },
  },
} as const;

/** A mentor's follow-ups and Home figures (owner, 2026-11-07). */
export const followUpPaths = {
  "/api/v1/follow-ups": {
    get: {
      tags: ["Follow-ups"],
      summary: "My follow-ups (MENTOR only)",
      description:
        "The caller's own: open ones by `dueAt`, then those done in the last 30 days, newest first. A deleted student's are left out. 403 for anyone but a MENTOR.",
      responses: {
        200: ok({ type: "object", properties: { followUps: { type: "array", items: followUp } } }, "The list."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/follow-ups/{id}/done": {
    post: {
      tags: ["Follow-ups"],
      summary: "Mark a follow-up done (MENTOR only)",
      description: "Only the mentor who made it (anyone else's id is 404). Done twice is still done.",
      parameters: [idParam],
      responses: {
        200: ok(followUp, "The follow-up, done."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/students/{id}/follow-ups": {
    post: {
      tags: ["Follow-ups"],
      summary: "Follow up with a student (MENTOR only)",
      description:
        "Body `{ reason? }`, trimmed, up to 500 characters; empty means none. Due 7 days later. The daily reminder then sends one `MENTOR_FOLLOWUP` notification to this mentor alone; it stays open until marked done. One open follow-up per mentor and student: 409 `already_following_up`.",
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: { type: "object", properties: { reason: { type: ["string", "null"], maxLength: 500 } } },
          },
        },
      },
      responses: {
        201: ok(followUp, "Created."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`already_following_up`."),
      },
    },
  },
  "/api/v1/me/mentor-summary": {
    get: {
      tags: ["Follow-ups"],
      summary: "The mentor's Home figures (MENTOR only)",
      description:
        "`followUpsDue` (open, at or past `dueAt`), `absentLately` (the `total` of `GET /students?absentLately=1`), `notesThisWeek` (notes visible to them written in the last 7 days), `students` (the `total` of `GET /students`). Each is the count of the list its card opens.",
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              followUpsDue: { type: "integer" },
              absentLately: { type: "integer" },
              notesThisWeek: { type: "integer" },
              students: { type: "integer" },
            },
          },
          "The four numbers.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
} as const;
