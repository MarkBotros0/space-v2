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

const STALE_NOTE =
  "A change marks the person's sessions stale (`sessionsValidFrom`): their refresh token stays valid and the next refresh re-reads `seasonAdminIds`, so nobody is signed out. Each real change writes one `[audit]` log line; a no-op writes nothing.";

export const seasonAdminPaths = {
  "/api/v1/seasons/{id}/staff-candidates": {
    get: {
      tags: ["Seasons"],
      summary: "Who can be picked to serve (SUPER or that season's admin)",
      description:
        "Live alumni with no active role, in name order. A role in a draft doesn't count. Name and last season only: a season admin sees nothing else of anyone's earlier seasons.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["people"],
            properties: {
              people: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "name", "lastSeason"],
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    lastSeason: {
                      type: ["object", "null"],
                      required: ["title"],
                      properties: { title: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
          "The candidates.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season, or it is deleted."),
      },
    },
  },
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
      description: `Idempotent: adding an existing admin answers 200 with the unchanged list and writes nothing. Only a live alumnus with no other active role can be added; a draft's roles and leading in this same season don't clash. ${STALE_NOTE}`,
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
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season (or it is deleted), or no such user."),
        409: conflict(
          '`not_alumnus`, `permanent_role` (a SUPER or MENTOR), `user_inactive`, `season_finished`, or `already_in_role`, with the reason in words: "Mina is already leading a group in GBV 2026".',
        ),
      },
    },
  },
  "/api/v1/seasons/{id}/admins/{userId}": {
    delete: {
      tags: ["Seasons"],
      summary: "Remove a season admin (SUPER)",
      description: `Idempotent: removing someone who is not an admin answers 200 with the unchanged list. No role or activation check, so a deactivated admin's row can be cleaned up. ${STALE_NOTE}`,
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
