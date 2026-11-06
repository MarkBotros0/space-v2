import { conflict, errRef, errorResponse, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/users/*`. Assembled into the document by `../openapi.ts`. */
export const userPaths = {
  "/api/v1/users": {
    get: {
      tags: ["Users"],
      summary: "User list (SUPER only)",
      description:
        "Cursor-paginated and filtered in the database. `status` is derived server-side (inactive, active, invited, pending); the password hash never leaves the server. `q` matches name or email, case-insensitive. `cursor` is the last row's id; `total` is the whole population under the current filters.",
      parameters: [
        { name: "q", in: "query", schema: { type: "string" } },
        { name: "role", in: "query", description: "ADMIN: holds a SeasonAdmin row in a DRAFT or ACTIVE season. LEADER: likewise a GroupLeader row. STUDENT: neither. SUPER and MENTOR are stored. Someone who administers and leads matches both ADMIN and LEADER. Each row's `role` is the derived one.", schema: { $ref: "#/components/schemas/UserRole" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["active", "invited", "pending", "inactive"] } },
        { name: "cursor", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
      ],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              users: { type: "array", items: { $ref: "#/components/schemas/UserListItem" } },
              nextCursor: { type: ["integer", "null"] },
              total: { type: "integer" },
            },
          },
          "One page of users.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
    post: {
      tags: ["Users"],
      summary: "Create a user and issue their invite (SUPER only)",
      description:
        "Creation and invitation are one operation. The account is created with a NULL password hash (there is no default password anywhere) and an invite is minted in the same transaction; the code goes out by email after commit. A mail failure (or no mail transport) never rolls back the account: the undelivered invite is expired again so the account reads `pending`, and the response says `inviteSent: false` (re-send from `POST /users/{id}/invite`). The email is trimmed and lower-cased, and `409 email_taken` is decided case-insensitively. The response never carries the code. LEADER, ADMIN and MENTOR require a graduationYear. A STUDENT gets a StudentProfile. Creating a SUPER requires `confirmSuper: true`, otherwise `400 confirm_super_required` (a SUPER grant can never be a mis-tapped picker item).",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "role"],
              properties: {
                name: { type: "string", minLength: 2, maxLength: 120 },
                email: { type: "string", format: "email" },
                role: {
                  type: "string",
                  enum: ["SUPER", "MENTOR", "STUDENT"],
                  description: "ADMIN or LEADER is `400 role_from_seasons`: they come from season rows.",
                },
                graduationYear: { type: ["integer", "null"], minimum: 1990 },
                confirmSuper: { type: "boolean", description: "Must be true when `role` is SUPER." },
              },
            },
          },
        },
      },
      responses: {
        201: ok(
          {
            type: "object",
            required: ["userId", "inviteSent"],
            properties: {
              userId: { type: "integer" },
              inviteSent: { type: "boolean", description: "False when the invite email could not be delivered." },
            },
          },
          "Created.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        409: conflict("`email_taken`."),
      },
    },
  },

  "/api/v1/users/invites/pending": {
    get: {
      tags: ["Users"],
      summary: "Count accounts a bulk invite would reach (SUPER only)",
      description:
        "\"Pending\" means: not deleted, no password, never signed in, and no live **v2** invite. A live v1 plaintext invite still counts as pending, because v2 can never accept it. The client hides the bulk button at zero.",
      responses: {
        200: ok({ type: "object", required: ["pending"], properties: { pending: { type: "integer", minimum: 0 } } }, "The count."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
    post: {
      tags: ["Users"],
      summary: "Send invites to pending accounts, one bounded batch (SUPER only)",
      description:
        "Processes at most 20 pending accounts per request, oldest id first; call again for the rest (`remaining`). Each account gets its own short transaction that row-locks the user and re-checks eligibility, so a double-tap or two SUPERs racing skip rather than re-mint (`skipped`). Mail goes out after the commits with a small concurrency pool. A mail failure expires the invite just minted, so that person stays pending and the next call retries them (`failed`). Refused with 503 `email_not_configured` when no mail transport is configured, so no invites are minted that nobody can receive. No response ever carries an invite code. Rate limited to 30 requests per hour.",
      responses: {
        200: ok(
          {
            type: "object",
            required: ["sent", "skipped", "failed", "remaining"],
            properties: {
              sent: { type: "integer", minimum: 0 },
              skipped: { type: "integer", minimum: 0 },
              failed: { type: "integer", minimum: 0 },
              remaining: { type: "integer", minimum: 0 },
            },
          },
          "Batch counters.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        429: errRef("TooManyRequests"),
        503: { description: "`email_not_configured`.", content: { "application/json": { schema: errorResponse } } },
      },
    },
  },

  "/api/v1/users/{id}": {
    get: {
      tags: ["Users"],
      summary: "User detail with invite metadata (SUPER only)",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/UserDetail" }, "The user."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Users"],
      summary: "Edit a user's name, role and graduation year (SUPER only)",
      description:
        "A full replace of `{ name, role, graduationYear }` (email is not editable; unknown keys are refused). MENTOR requires a graduationYear.\n\n**The account holds SUPER, MENTOR or STUDENT; admin and leader come from season rows.** `role` is compared with the derived role GET returns. Sending that same value is not a change, even when the stored role differs, and leaves the stored role alone. Any other ADMIN or LEADER is `400 role_from_seasons`. Someone holding a row in a DRAFT or ACTIVE season can't move to SUPER or MENTOR, and a derived ADMIN or LEADER can't move to STUDENT: `409 has_season_role` until they're removed from that season. No role change deletes a season row.\n\n**A real change is a revocation.** In one transaction: a user landing on STUDENT gets a StudentProfile, and every live refresh token of the target is revoked, so the old claims cannot be re-minted. Access tokens already issued end at once (`sessionsValidFrom`).\n\nGuards: changing your own role is `409 cannot_change_own_role` (renaming yourself is fine); granting SUPER needs `confirmSuper: true` (`400 confirm_super_required`); demoting the only active SUPER is `409 last_super` (the active SUPER rows are locked FOR UPDATE inside the transaction, so two concurrent demotions cannot both pass). Answers with the same `UserDetail` GET returns.\n\nA soft-deleted (deactivated) target is `404 not_found` (REG-104); GET and reactivate still reach it.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "role", "graduationYear"],
              additionalProperties: false,
              properties: {
                name: { type: "string", minLength: 2, maxLength: 120 },
                role: { $ref: "#/components/schemas/UserRole" },
                graduationYear: { type: ["integer", "null"], minimum: 1990 },
                confirmSuper: { type: "boolean", description: "Must be true for a role change to SUPER." },
              },
            },
          },
        },
      },
      responses: {
        200: ok({ $ref: "#/components/schemas/UserDetail" }, "The updated user."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`cannot_change_own_role`, `last_super` or `has_season_role`."),
      },
    },
  },

  "/api/v1/users/{id}/invite": {
    post: {
      tags: ["Users"],
      summary: "Issue (or re-issue) an invite (SUPER only)",
      description:
        "Mints a fresh invite and emails the code; only once the mail has gone are the target's older live invites expired (one live invite per user). If the send fails the new code is withdrawn and the earlier invite keeps working: `502 email_send_failed`. With no mail transport nothing is minted: `503 email_not_configured`, as the bulk sender answers. The response is the invite metadata only; the code is never returned. Refused explicitly: an already-activated target is `409 already_activated`, a deactivated one `409 user_deleted`.",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/InviteState" }, "The new invite's metadata."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`already_activated` or `user_deleted`."),
        502: { description: "`email_send_failed`.", content: { "application/json": { schema: errorResponse } } },
        503: { description: "`email_not_configured`.", content: { "application/json": { schema: errorResponse } } },
      },
    },
  },

  "/api/v1/users/{id}/deactivate": {
    post: {
      tags: ["Users"],
      summary: "Deactivate a user (SUPER only)",
      description:
        "Soft-deletes the user and revokes every live refresh token in the same transaction. Refused for yourself (`400 cannot_deactivate_self`) and for the only active SUPER (`409 last_super`, serialised with row locks).",
      parameters: [idParam],
      responses: {
        200: ok(
          { type: "object", required: ["deletedAt"], properties: { deletedAt: { type: "string", format: "date-time" } } },
          "Deactivated.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`last_super`."),
      },
    },
  },

  "/api/v1/users/{id}/reactivate": {
    post: {
      tags: ["Users"],
      summary: "Reactivate a deactivated user (SUPER only)",
      description: "Also clears a student profile's deletion stamp (set by `DELETE /students/{id}`).",
      parameters: [idParam],
      responses: {
        200: ok(
          { type: "object", required: ["deletedAt"], properties: { deletedAt: { type: "null" } } },
          "Reactivated.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },

} as const;
