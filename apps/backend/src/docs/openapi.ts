/**
 * OpenAPI 3.1 description of the whole `/api/v1` surface.
 *
 * Hand-authored rather than generated. The request bodies have Zod schemas in
 * `packages/shared`, but the *responses* are plain TypeScript interfaces (the
 * backend never validates its own output), so there is no single source to
 * generate from. When you change a route, change this document in the same
 * commit — it is the contract the mobile client is written against.
 *
 * Served by `src/routes/docs.ts` at /api/docs (UI) and /api/docs.json (raw).
 */

/** `{ error: { code, message } }` — every failure in the API uses this shape. */
const errorResponse = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "forbidden" },
        message: { type: "string", example: "You don't have access to this." },
      },
    },
  },
} as const;

/** Wrap a schema in the `{ data: ... }` success envelope. */
function ok(schema: unknown, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["data"],
          properties: { data: schema },
        },
      },
    },
  };
}

function errRef(ref: string) {
  return { $ref: `#/components/responses/${ref}` };
}

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
} as const;

const publicIdParam = {
  name: "publicId",
  in: "path",
  required: true,
  description: "Opaque 10-character submission identifier — not numeric.",
  schema: { type: "string" },
} as const;

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "JPC Space API (space-v2)",
    version: "1.0.0",
    description: [
      "The mobile API for JPC Space.",
      "",
      "This service is a port of the v1 Next.js app's `/api/v1` surface and runs against",
      "**the same database**. Access tokens are interchangeable between the two: same",
      "secret, same `jpc-mobile` audience, same claims, same 15-minute TTL.",
      "",
      "**Envelope.** Success responses are `{ \"data\": ... }`. Failures are",
      "`{ \"error\": { \"code\", \"message\" } }` — including 404s, rate-limit rejections,",
      "and malformed JSON bodies. The one exception is the file-download endpoint, whose",
      "success path returns raw bytes; its error paths still use the envelope.",
      "",
      "**Auth.** Every endpoint except `/health`, `/api/v1/auth/*` requires",
      "`Authorization: Bearer <accessToken>`. Access tokens last 15 minutes; rotate with",
      "`POST /api/v1/auth/refresh`, which also revokes the presented refresh token.",
      "",
      "**Timestamps** are ISO-8601 strings.",
    ].join("\n"),
  },
  servers: [
    { url: "http://localhost:4000", description: "Local development" },
  ],
  tags: [
    { name: "Health", description: "Liveness" },
    { name: "Auth", description: "Login, refresh, logout" },
    { name: "Me", description: "The authenticated user" },
    { name: "Seasons", description: "Seasons and their sub-resources" },
    { name: "Groups", description: "Group detail" },
    { name: "Sessions", description: "Sessions, attendance, and check-in" },
    { name: "Assignments", description: "Assignment detail" },
    { name: "Submissions", description: "Submissions and their files" },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token from `POST /api/v1/auth/login`.",
      },
    },
    responses: {
      BadRequest: {
        description: "`bad_request` — malformed path parameter or body.",
        content: { "application/json": { schema: errorResponse } },
      },
      Unauthorized: {
        description: "`unauthorized` — missing, malformed, or expired access token.",
        content: { "application/json": { schema: errorResponse } },
      },
      Forbidden: {
        description: "`forbidden` — authenticated, but not permitted to see or change this.",
        content: { "application/json": { schema: errorResponse } },
      },
      NotFound: {
        description: "`not_found` — no such resource, or it is outside your scope.",
        content: { "application/json": { schema: errorResponse } },
      },
      TooManyRequests: {
        description: "`too_many_requests` — auth rate limit exceeded.",
        content: { "application/json": { schema: errorResponse } },
      },
    },
    schemas: {
      Error: errorResponse,
      UserRole: { type: "string", enum: ["SUPER", "ADMIN", "LEADER", "STUDENT", "MENTOR"] },
      SeasonStatus: { type: "string", enum: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] },
      AttendanceStatus: { type: "string", enum: ["PRESENT", "ABSENT", "LATE"] },
      SubmissionStatus: { type: "string", enum: ["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED"] },
      AssignmentType: { type: "string", enum: ["STANDARD", "FORUM"] },

      Session: {
        type: "object",
        description: "An issued token pair.",
        required: ["accessToken", "expiresIn", "refreshToken"],
        properties: {
          accessToken: { type: "string" },
          expiresIn: { type: "integer", example: 900, description: "Seconds until the access token expires." },
          refreshToken: { type: "string", description: "Opaque; rotated on every refresh." },
        },
      },
      AuthUser: {
        type: "object",
        required: ["id", "name", "email", "role"],
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: { $ref: "#/components/schemas/UserRole" },
        },
      },

      SeasonListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string", example: "gbv-2026" },
          title: { type: "string" },
          program: { type: "string", example: "GBV" },
          year: { type: "integer" },
          status: { $ref: "#/components/schemas/SeasonStatus" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
        },
      },
      SeasonDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          code: { type: "string" },
          title: { type: "string" },
          program: { type: "string" },
          year: { type: "integer" },
          description: { type: ["string", "null"] },
          status: { $ref: "#/components/schemas/SeasonStatus" },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          sessionCount: { type: "integer" },
          studentCount: { type: "integer" },
          groups: {
            type: "array",
            description: "A STUDENT sees only their own group here.",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
                studentCount: { type: "integer" },
                leaderNames: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },

      GroupListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          studentCount: { type: "integer" },
          leaderNames: { type: "array", items: { type: "string" } },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
        },
      },
      GroupMember: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: ["string", "null"] },
          email: { type: "string", format: "email" },
        },
      },
      GroupDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
          leaders: { type: "array", items: { $ref: "#/components/schemas/GroupMember" } },
          students: { type: "array", items: { $ref: "#/components/schemas/GroupMember" } },
        },
      },

      SessionListItem: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          startsAt: { type: "string", format: "date-time" },
          durationMinutes: { type: "integer" },
          location: { type: ["string", "null"] },
          recurrenceGroupId: { type: ["string", "null"] },
          attendanceMarked: { type: "boolean" },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
          checkInToken: {
            type: ["string", "null"],
            description:
              "**Always null for a STUDENT.** Possession of this value authorises a check-in, so it is never read from the database for that role.",
          },
          checkInOpenAt: { type: ["string", "null"], format: "date-time" },
          checkInClosedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      SessionDetail: {
        type: "object",
        description: "Never includes `checkInToken`, for any role.",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          startsAt: { type: "string", format: "date-time" },
          durationMinutes: { type: "integer" },
          location: { type: ["string", "null"] },
          youtubeUrl: { type: ["string", "null"] },
          recurrenceGroupId: { type: ["string", "null"] },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
          checkInOpen: { type: "boolean" },
          myAttendance: {
            type: ["object", "null"],
            description: "Populated only for a STUDENT.",
            properties: {
              status: { $ref: "#/components/schemas/AttendanceStatus" },
              notes: { type: ["string", "null"] },
              lateMinutes: { type: ["integer", "null"] },
              checkedInAt: { type: ["string", "null"], format: "date-time" },
            },
          },
          canMarkAttendance: { type: "boolean" },
        },
      },
      AttendanceRosterRow: {
        type: "object",
        properties: {
          studentUserId: { type: "integer" },
          name: { type: ["string", "null"] },
          email: { type: "string", format: "email" },
          groupName: { type: ["string", "null"] },
          status: {
            oneOf: [{ $ref: "#/components/schemas/AttendanceStatus" }, { type: "null" }],
            description: "Null when attendance has not been marked for this student.",
          },
          notes: { type: ["string", "null"] },
          lateMinutes: { type: ["integer", "null"] },
        },
      },
      AttendanceEntry: {
        type: "object",
        required: ["studentUserId", "status"],
        properties: {
          studentUserId: { type: "integer" },
          status: { $ref: "#/components/schemas/AttendanceStatus" },
          notes: { type: ["string", "null"], maxLength: 500 },
          lateMinutes: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 600,
            description: "Stored only when `status` is LATE; any other status writes null.",
          },
        },
      },

      StaffAssignmentListItem: {
        type: "object",
        description: "Returned to SUPER, ADMIN, LEADER and MENTOR.",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          dueAt: { type: ["string", "null"], format: "date-time" },
          isAllGroups: { type: "boolean" },
          submissionCount: { type: "integer" },
          expectedCount: { type: "integer" },
          seasonCode: { type: "string" },
        },
      },
      StudentAssignmentListItem: {
        type: "object",
        description: "Returned to a STUDENT — their own status per assignment.",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          dueAt: { type: ["string", "null"], format: "date-time" },
          status: {
            oneOf: [
              { $ref: "#/components/schemas/SubmissionStatus" },
              { type: "string", enum: ["PENDING"] },
            ],
          },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      AssignmentDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          seasonId: { type: "integer" },
          seasonCode: { type: "string" },
          seasonTitle: { type: "string" },
          sessionId: { type: ["integer", "null"] },
          sessionTitle: { type: ["string", "null"] },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          dueAt: { type: ["string", "null"], format: "date-time" },
          isAllGroups: { type: "boolean" },
          type: { $ref: "#/components/schemas/AssignmentType" },
          forumMinWords: { type: ["integer", "null"] },
          forumAllowComments: { type: "boolean" },
          maxFileSizeMb: { type: ["integer", "null"] },
          allowedMimeCategories: {
            type: "array",
            items: { type: "string", enum: ["image", "pdf", "doc", "audio", "video", "text"] },
            description: "Empty means any MIME type is accepted.",
          },
          groupIds: { type: "array", items: { type: "integer" } },
          mySubmission: {
            type: ["object", "null"],
            description: "Populated only for a STUDENT.",
            properties: {
              publicId: { type: "string" },
              status: { $ref: "#/components/schemas/SubmissionStatus" },
              submittedAt: { type: ["string", "null"], format: "date-time" },
              reviewedAt: { type: ["string", "null"], format: "date-time" },
              feedback: { type: ["string", "null"] },
            },
          },
        },
      },

      SubmissionFile: {
        type: "object",
        properties: {
          id: { type: "integer" },
          originalName: { type: "string" },
          storagePath: { type: "string" },
          mimeType: { type: "string" },
          sizeBytes: { type: "integer" },
        },
      },
      SubmissionDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          publicId: { type: "string" },
          status: { $ref: "#/components/schemas/SubmissionStatus" },
          text: { type: ["string", "null"] },
          feedback: { type: ["string", "null"] },
          submittedAt: { type: ["string", "null"], format: "date-time" },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
          assignmentId: { type: "integer" },
          assignmentTitle: { type: "string" },
          assignmentDueAt: { type: ["string", "null"], format: "date-time" },
          assignmentDescription: { type: ["string", "null"] },
          seasonCode: { type: "string" },
          studentUserId: { type: "integer" },
          studentName: { type: ["string", "null"] },
          studentEmail: { type: "string", format: "email" },
          files: { type: "array", items: { $ref: "#/components/schemas/SubmissionFile" } },
        },
      },
    },
  },

  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness plus a database round-trip",
        security: [],
        responses: {
          200: ok({ type: "object", properties: { status: { type: "string", example: "ok" } } }, "Service and database are reachable."),
          503: { description: "Database unreachable.", content: { "application/json": { schema: errorResponse } } },
        },
      },
    },

    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Exchange credentials for a token pair",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          200: ok(
            {
              allOf: [
                { $ref: "#/components/schemas/Session" },
                { type: "object", properties: { user: { $ref: "#/components/schemas/AuthUser" } } },
              ],
            },
            "Authenticated.",
          ),
          400: errRef("BadRequest"),
          401: {
            description: "`invalid_credentials` — deliberately identical whether the email is unknown or the password is wrong.",
            content: { "application/json": { schema: errorResponse } },
          },
          429: errRef("TooManyRequests"),
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate a refresh token",
        description: "The presented token is revoked and a fresh pair issued. Reusing a rotated token fails.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string", minLength: 1 } },
              },
            },
          },
        },
        responses: {
          200: ok({ $ref: "#/components/schemas/Session" }, "A fresh token pair."),
          400: errRef("BadRequest"),
          401: {
            description: "`invalid_token` — unknown, revoked, or expired.",
            content: { "application/json": { schema: errorResponse } },
          },
          429: errRef("TooManyRequests"),
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke a refresh token",
        description:
          "Idempotent: an unknown or already-revoked token also returns 200, so the response never discloses whether a token existed.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string", minLength: 1 } },
              },
            },
          },
        },
        responses: {
          200: ok({ type: "object", properties: { ok: { type: "boolean", example: true } } }, "Revoked, or already was."),
          400: errRef("BadRequest"),
          429: errRef("TooManyRequests"),
        },
      },
    },

    "/api/v1/me": {
      get: {
        tags: ["Me"],
        summary: "The authenticated user and their scopes",
        description: "Scopes come from the token's claims, not a fresh database read — they are what this token was minted with.",
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                user: {
                  type: ["object", "null"],
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    role: { $ref: "#/components/schemas/UserRole" },
                    avatarPath: { type: ["string", "null"] },
                  },
                },
                scopes: {
                  type: "object",
                  properties: {
                    seasonAdminIds: { type: "array", items: { type: "integer" } },
                    groupLeaderIds: { type: "array", items: { type: "integer" } },
                    activeSeasonId: { type: ["integer", "null"] },
                    graduationYear: {
                      type: ["integer", "null"],
                      description: "Set when a student has graduated; non-null means alumnus.",
                    },
                  },
                },
              },
            },
            "The current user.",
          ),
          401: errRef("Unauthorized"),
        },
      },
    },

    "/api/v1/seasons": {
      get: {
        tags: ["Seasons"],
        summary: "Seasons visible to the caller",
        description:
          "SUPER and MENTOR see all; ADMIN sees their scoped seasons; LEADER sees seasons containing a group they lead; STUDENT sees seasons they are enrolled in. Filtering happens in the query, so a season you cannot see is never read.",
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                seasons: { type: "array", items: { $ref: "#/components/schemas/SeasonListItem" } },
              },
            },
            "Visible seasons, newest year first.",
          ),
          401: errRef("Unauthorized"),
        },
      },
    },
    "/api/v1/seasons/{id}": {
      get: {
        tags: ["Seasons"],
        summary: "Season detail with counts and groups",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/SeasonDetail" }, "The season."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },
    "/api/v1/seasons/{id}/groups": {
      get: {
        tags: ["Seasons"],
        summary: "Groups in a season",
        description: "A STUDENT receives only their own group.",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { groups: { type: "array", items: { $ref: "#/components/schemas/GroupListItem" } } } },
            "Groups.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/seasons/{id}/sessions": {
      get: {
        tags: ["Seasons"],
        summary: "Sessions in a season",
        description: "`checkInToken` is null for a STUDENT.",
        parameters: [idParam],
        responses: {
          200: ok(
            { type: "object", properties: { sessions: { type: "array", items: { $ref: "#/components/schemas/SessionListItem" } } } },
            "Sessions, earliest first.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },
    "/api/v1/seasons/{id}/assignments": {
      get: {
        tags: ["Seasons"],
        summary: "Assignments in a season",
        description:
          "**The row shape depends on the caller's role.** Staff receive `StaffAssignmentListItem` (season-wide counts); a STUDENT receives `StudentAssignmentListItem` (their own status), filtered to assignments that target them.",
        parameters: [idParam],
        responses: {
          200: ok(
            {
              type: "object",
              properties: {
                assignments: {
                  type: "array",
                  items: {
                    oneOf: [
                      { $ref: "#/components/schemas/StaffAssignmentListItem" },
                      { $ref: "#/components/schemas/StudentAssignmentListItem" },
                    ],
                  },
                },
              },
            },
            "Assignments.",
          ),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
        },
      },
    },

    "/api/v1/groups/{id}": {
      get: {
        tags: ["Groups"],
        summary: "Group detail with leaders and students",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/GroupDetail" }, "The group."),
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
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/SessionDetail" }, "The session."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
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
          "Marks the caller PRESENT, or LATE with the elapsed minutes if check-in opened earlier. Check-in hard-stops three hours after opening even if never explicitly closed.",
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
                minutesLate: { type: "integer" },
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

    "/api/v1/assignments/{id}": {
      get: {
        tags: ["Assignments"],
        summary: "Assignment detail",
        description:
          "Season access alone is not enough: for a targeted assignment (`isAllGroups: false`), a STUDENT must also be in one of the targeted groups.",
        parameters: [idParam],
        responses: {
          200: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "The assignment."),
          400: errRef("BadRequest"),
          401: errRef("Unauthorized"),
          403: errRef("Forbidden"),
          404: errRef("NotFound"),
        },
      },
    },

    "/api/v1/submissions/{publicId}": {
      get: {
        tags: ["Submissions"],
        summary: "Submission detail",
        description:
          "Readable by the author, the student's group leader, a season admin, SUPER and MENTOR. A peer student cannot read another's submission.",
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
          "**Author only** — reading and writing are different rights, so a season admin who can read this submission still cannot edit it. `submit: true` sets status SUBMITTED and stamps `submittedAt`; omitting it returns the row to DRAFT, so saving a draft after submitting un-submits it.",
        parameters: [publicIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string" },
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
          "When enabled: author only. The assignment's own `maxFileSizeMb` and",
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
        description: "Author only. The file must belong to this submission.",
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
  },
} as const;
