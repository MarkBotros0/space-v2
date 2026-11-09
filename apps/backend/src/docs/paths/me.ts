import { conflict, errRef, ok } from "../helpers";
import { meDashboardPaths } from "./me-dashboard";

/** `/api/v1/me/*`. Assembled into the document by `../openapi.ts`. */
export const mePaths = {
  "/api/v1/me": {
    get: {
      tags: ["Me"],
      summary: "The authenticated user and their scopes",
      description:
        "Scopes come from the token's claims, not a fresh database read — they are what this token was minted with. `user` is null when the row is soft-deleted (or gone).",
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
                  phone: { type: ["string", "null"] },
                  dateOfBirth: {
                    type: ["string", "null"],
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    description: "A calendar date.",
                  },
                  address: { type: ["string", "null"] },
                  hasPassword: {
                    type: "boolean",
                    description: "False for an invited account that has never set a password.",
                  },
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
    delete: {
      tags: ["Me"],
      summary: "Delete your own account",
      description:
        "Self-scoped soft delete, the same as a SUPER deactivating the account: sets `deletedAt` on the user (and student profile), removes this account's push devices, revokes every refresh token and ends live access tokens. Sign-in, refresh and password reset refuse the account afterwards. 409 `last_super` when the caller is the only active SUPER.",
      responses: {
        200: ok(
          {
            type: "object",
            required: ["deletedAt"],
            properties: { deletedAt: { type: "string", format: "date-time" } },
          },
          "The account is deleted.",
        ),
        401: errRef("Unauthorized"),
        404: errRef("NotFound"),
        409: conflict("The caller is the only active SUPER account."),
      },
    },
    patch: {
      tags: ["Me"],
      summary: "Update your own name and contact details (any role)",
      description:
        'Self-scoped: the subject is the token, never the body. Partial: send any subset of `name`, `phone`, `dateOfBirth`, `address`, at least one (an empty body is a 400). Absent = untouched; for phone, dateOfBirth and address `""` or null clears, and name cannot be cleared. Strings are trimmed: name 2-120 characters, phone at most 60, address at most 300; dateOfBirth is a real calendar day `YYYY-MM-DD`. A body carrying `userId` (or any unknown key) is a 400. Returns the updated user.',
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              minProperties: 1,
              additionalProperties: false,
              properties: {
                name: { type: "string", minLength: 2, maxLength: 120 },
                phone: { type: ["string", "null"], maxLength: 60 },
                dateOfBirth: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                address: { type: ["string", "null"], maxLength: 300 },
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
              user: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  name: { type: "string" },
                  email: { type: "string", format: "email" },
                  role: { $ref: "#/components/schemas/UserRole" },
                  avatarPath: { type: ["string", "null"] },
                  phone: { type: ["string", "null"] },
                  dateOfBirth: {
                    type: ["string", "null"],
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    description: "A calendar date.",
                  },
                  address: { type: ["string", "null"] },
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

  ...meDashboardPaths,
  "/api/v1/me/season-history": {
    get: {
      tags: ["Me"],
      summary: "The caller's past seasons (students and alumni)",
      description:
        "Self only. Lists every enrollment that is not ACTIVE (finished or withdrawn), each with its season code and outcome. Soft-deleted and DRAFT seasons are hidden. Staff get 403.",
      responses: {
        200: ok(
          {
            type: "object",
            properties: { seasons: { type: "array", items: { $ref: "#/components/schemas/SeasonHistoryRow" } } },
          },
          "Past seasons, most recent enrollment first.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/me/seasons/{seasonId}": {
    get: {
      tags: ["Me"],
      summary: "The caller's own read-only record of one past season (students and alumni)",
      description:
        "404 when the caller has no finished enrollment in it, the enrollment is still ACTIVE, or the season is deleted or a DRAFT. Staff get 403.",
      parameters: [{ name: "seasonId", in: "path", required: true, schema: { type: "integer" } }],
      responses: {
        200: ok(
          { type: "object", properties: { record: { $ref: "#/components/schemas/SeasonRecord" } } },
          "The season record.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/me/season": {
    get: {
      tags: ["Me"],
      summary: "The caller's current season — progress, group, next sessions (students)",
      responses: {
        200: ok(
          {
            type: "object",
            properties: { season: { oneOf: [{ $ref: "#/components/schemas/MySeason" }, { type: "null" }] } },
          },
          "Null when the student has no active season.",
        ),
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
        200: ok(
          { $ref: "#/components/schemas/MyAttendance" },
          "Empty shape (season null) when there is no active season.",
        ),
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
        200: ok(
          { type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } },
          "The profile.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Me"],
      summary:
        "Edit the caller's own student profile (students, and alumni while studying; other alumni are read-only)",
      description:
        "PATCH: absent = untouched, '' or null = cleared. Any key outside university/faculty/universityGraduationYear/phone/dateOfBirth is refused 403 forbidden_field — name and address are PATCH /me, email is staff-only. phone and dateOfBirth are account-level (User) fields, the same ones PATCH /me writes.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                university: { type: ["string", "null"], maxLength: 160 },
                faculty: { type: ["string", "null"], maxLength: 160 },
                universityGraduationYear: {
                  type: ["integer", "null"],
                  minimum: 1950,
                  maximum: 2100,
                  description: "University graduation year; may be in the future. Not the JPCS graduationYear.",
                },
                phone: { type: ["string", "null"], maxLength: 60 },
                dateOfBirth: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", properties: { profile: { $ref: "#/components/schemas/MyProfile" } } },
          "The updated profile.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
} as const;
