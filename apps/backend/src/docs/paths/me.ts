import { conflict, errRef, ok } from "../helpers";

/** `/api/v1/me/*`. Assembled into the document by `../openapi.ts`. */
export const mePaths = {
  "/api/v1/me": {
    get: {
      tags: ["Me"],
      summary: "The authenticated user and their scopes",
      description: "Scopes come from the token's claims, not a fresh database read — they are what this token was minted with. `user` is null when the row is soft-deleted (or gone).",
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
                  hasPassword: { type: "boolean", description: "False for an invited account that has never set a password." },
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
    patch: {
      tags: ["Me"],
      summary: "Update your own display name",
      description:
        "Self-scoped: the subject is the token, never the body. A body carrying `userId` (or any unknown key) is a 400. The name is trimmed, 2-120 characters. Returns the updated user.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              additionalProperties: false,
              properties: { name: { type: "string", minLength: 2, maxLength: 120 } },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                  role: { $ref: "#/components/schemas/UserRole" },
                  avatarPath: { type: ["string", "null"] },
                  hasPassword: { type: "boolean" },
                },
              },
            },
          },
          "The updated user.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
      },
    },
  },

  "/api/v1/me/dashboard": {
    get: {
      tags: ["Me"],
      summary: "The caller's role dashboard figures",
      description: [
        "A discriminated union on `variant` (spec 19 §7). Every figure is derived once, server-side (ruling C4); clients render, never recompute.",
        "",
        "- **STUDENT** (not graduated): the caller's own figures only — no cohort, no other student, no score (C8). Season from the token's `activeSeasonId`; `seasonId` is ignored. With no active season every field but `variant` is null.",
        "- **SEASON_STAFF**: `seasonId` required. ADMIN must administer it, SUPER may name any, a LEADER gets `scope: \"groups\"` over the ACTIVE enrolments of the groups they lead in it. Attendance % starts at each student's enrolment and never exceeds 100; `atRisk` is the shared `isAtRisk` (either component below 60), not v1's 70 % rule; review counts use the review queue's own scope; ONLINE quiz drafts are counted as `drafts`.",
        "- **MENTOR**: the eight most recent attendance marks, submissions and reviews across all seasons, merged and newest first (reviews at `reviewedAt`), excluding DRAFT work, graduated or deleted students and deleted assignments or seasons. The mentor's at-risk list is `GET /api/v1/reports/engagement`.",
        "- An alumnus gets 403.",
        "",
        "`nextSession` is the session in progress (`isInProgress: true`) if there is one, else the next; `dayKey`/`time` are the organisation's calendar day and wall-clock time.",
      ].join("\n"),
      parameters: [
        {
          name: "seasonId",
          in: "query",
          required: false,
          description: "Required for ADMIN, LEADER and SUPER; ignored for STUDENT and MENTOR.",
          schema: { type: "integer", minimum: 1 },
        },
      ],
      responses: {
        200: ok(
          {
            oneOf: [
              {
                type: "object",
                description: "variant STUDENT",
                properties: {
                  variant: { const: "STUDENT" },
                  season: { type: ["object", "null"] },
                  progress: {
                    type: ["object", "null"],
                    properties: {
                      sessionsHeld: { type: "integer" },
                      sessionsTotal: { type: "integer" },
                      pct: { type: ["integer", "null"] },
                    },
                  },
                  nextSession: { type: ["object", "null"] },
                  assignments: {
                    type: ["object", "null"],
                    properties: {
                      outstandingCount: { type: "integer", description: "PENDING or DRAFT, targeted assignments only." },
                      overdueCount: { type: "integer" },
                      lateSubmittedCount: { type: "integer" },
                      dueSoon: { type: "array", maxItems: 3, items: { type: "object" } },
                    },
                  },
                },
              },
              {
                type: "object",
                description: "variant SEASON_STAFF",
                properties: {
                  variant: { const: "SEASON_STAFF" },
                  scope: { enum: ["season", "groups"] },
                  season: { type: "object" },
                  groups: { type: "array", items: { type: "object" } },
                  progress: { type: "object" },
                  nextSession: { type: ["object", "null"] },
                  cohort: {
                    type: "object",
                    properties: {
                      studentCount: { type: "integer" },
                      meanAttendancePct: { type: ["integer", "null"], description: "Mean over students with at least one past session; null when none." },
                      atRiskTotal: { type: "integer" },
                      atRisk: { type: "array", maxItems: 10, items: { type: "object" } },
                    },
                  },
                  submissions: {
                    type: "object",
                    properties: { pendingReview: { type: "integer" }, reviewed: { type: "integer" } },
                  },
                  quizzes: {
                    type: "object",
                    properties: {
                      total: { type: "integer" },
                      pending: { type: "integer" },
                      fullyGraded: { type: "integer" },
                      drafts: { type: "integer" },
                    },
                  },
                },
              },
              {
                type: "object",
                description: "variant MENTOR",
                properties: {
                  variant: { const: "MENTOR" },
                  recentActivity: { type: "array", maxItems: 8, items: { type: "object" } },
                },
              },
            ],
          },
          "The caller's dashboard variant.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/me/season-history": {
    get: {
      tags: ["Me"],
      summary: "The caller's past seasons (students and alumni)",
      description: "Self only. A current student's active season is excluded; an alumnus sees every enrollment. Soft-deleted seasons are hidden.",
      responses: {
        200: ok({ type: "object", properties: { seasons: { type: "array", items: { $ref: "#/components/schemas/SeasonHistoryRow" } } } }, "Past seasons, most recent enrollment first."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/me/season": {
    get: {
      tags: ["Me"],
      summary: "The caller's current season — progress, group, next sessions (students)",
      responses: {
        200: ok({ type: "object", properties: { season: { oneOf: [{ $ref: "#/components/schemas/MySeason" }, { type: "null" }] } } }, "Null when the student has no active season."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/me/attendance": {
    get: {
      tags: ["Me"],
      summary: "The caller's absence budget, streak and past-session attendance (students)",
      responses: {
        200: ok({ $ref: "#/components/schemas/MyAttendance" }, "Empty shape (season null) when there is no active season."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/me/profile": {
    get: {
      tags: ["Me"],
      summary: "The caller's own student profile (students and alumni)",
      responses: {
        200: ok({ type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } }, "The profile."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Me"],
      summary: "Edit the caller's own StudentProfile columns (students; alumni are read-only)",
      description: "PATCH: absent = untouched, '' or null = cleared. Any key outside university/year/phone/dateOfBirth/spiritualBackground/gifts is refused 403 forbidden_field — name is PATCH /me, email is staff-only.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                university: { type: ["string", "null"], maxLength: 160 },
                year: { type: ["string", "null"], maxLength: 40 },
                phone: { type: ["string", "null"], maxLength: 60 },
                dateOfBirth: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                spiritualBackground: { type: ["string", "null"], maxLength: 4000 },
                gifts: { type: ["string", "null"], maxLength: 2000 },
              },
            },
          },
        },
      },
      responses: {
        200: ok({ type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } }, "The updated profile."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/me/password": {
    post: {
      tags: ["Me"],
      summary: "Change your password and evict other sessions",
      description:
        "Verifies `currentPassword`, writes a bcrypt cost-12 hash and revokes every refresh token of the caller in one transaction, **except** the one whose raw value is sent as `refreshToken` (this device). Omit `refreshToken` and every session is revoked. A wrong current password is `400 incorrect_password` (deliberately not 401, which the mobile client reads as an expired access token). An invited account with no password is `409 no_password`. Rate limited (10 / 15 min per IP); 429 uses the standard envelope. New password: 8+ characters, at most 72 bytes. Also expires any outstanding password-reset codes.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["currentPassword", "newPassword"],
              additionalProperties: false,
              properties: {
                currentPassword: { type: "string", minLength: 1 },
                newPassword: { type: "string", minLength: 8 },
                refreshToken: { type: "string", description: "The caller's own refresh token, spared from the sweep." },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["ok", "sessionsRevoked"],
            properties: { ok: { type: "boolean", example: true }, sessionsRevoked: { type: "integer", minimum: 0 } },
          },
          "Changed.",
        ),
        400: conflict("`bad_request` (malformed body) or `incorrect_password`."),
        401: errRef("Unauthorized"),
        409: conflict("`no_password`."),
        429: errRef("TooManyRequests"),
      },
    },
  },

} as const;
