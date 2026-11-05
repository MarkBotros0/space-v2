import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/**
 * `/api/v1/seasons/{id}/admins*` — SUPER-only season admin management, with
 * the two schemas only these paths use. Assembled into the document by
 * `../openapi.ts`.
 */
export const seasonAdminSchemas = {
  SeasonAdmin: {
    type: "object",
    required: ["userId", "name", "email", "assignedAt", "assignedByName"],
    properties: {
      userId: { type: "integer" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      assignedAt: { type: "string", format: "date-time" },
      assignedByName: {
        type: ["string", "null"],
        description: "Null when the row predates v2 or the assigner's account was removed.",
      },
    },
  },
  SeasonAdminList: {
    type: "object",
    required: ["admins"],
    properties: {
      admins: {
        type: "array",
        description: "Ordered by name.",
        items: { $ref: "#/components/schemas/SeasonAdmin" },
      },
    },
  },
} as const;

const list = (description: string) => ok({ $ref: "#/components/schemas/SeasonAdminList" }, description);

const userIdParam = {
  name: "userId",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
} as const;

const REVOKE_NOTE =
  "A change revokes every refresh token the user holds, so their `seasonAdminIds` claim is re-derived at their next sign-in; an access token already issued keeps the old claim for at most 15 minutes. Each real change writes one `[audit]` log line; a no-op writes nothing.";

export const seasonAdminPaths = {
  "/api/v1/seasons/{id}/admins": {
    get: {
      tags: ["Seasons"],
      summary: "List a season's admins (SUPER)",
      parameters: [idParam],
      responses: {
        200: list("The season's admins."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season, or it is deleted."),
      },
    },
    post: {
      tags: ["Seasons"],
      summary: "Add a season admin (SUPER)",
      description: `Idempotent: adding an existing admin answers 200 with the unchanged list and writes nothing. Only an active user whose role is ADMIN can be added. ${REVOKE_NOTE}`,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userId"],
              properties: { userId: { type: "integer", minimum: 1 } },
            },
          },
        },
      },
      responses: {
        200: list("Already an admin — the list, unchanged."),
        201: list("Added — the list as it now stands."),
        400: conflict(
          "`bad_request` (path or body), `not_an_admin` (the user's role is not ADMIN), or `user_inactive` (the account is deactivated).",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season (or it is deleted), or no such user."),
      },
    },
  },
  "/api/v1/seasons/{id}/admins/{userId}": {
    delete: {
      tags: ["Seasons"],
      summary: "Remove a season admin (SUPER)",
      description: `Idempotent: removing someone who is not an admin answers 200 with the unchanged list. No role or activation check, so a deactivated admin's row can be cleaned up. ${REVOKE_NOTE}`,
      parameters: [idParam, userIdParam],
      responses: {
        200: list("The list as it now stands."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season, or it is deleted."),
      },
    },
  },
} as const;
