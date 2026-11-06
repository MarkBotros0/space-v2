import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

const userIdParam = {
  name: "userId",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
};

/** `/api/v1/seasons/{id}/enrollments`: adding people to a season and taking them off a draft. Assembled by `../openapi.ts`. */
export const seasonEnrollmentPaths = {
  "/api/v1/seasons/{id}/enrollments": {
    post: {
      tags: ["Seasons"],
      summary: "Add people to a season, all or nothing (SUPER or that season's admin)",
      description:
        "Under each person's row lock, refuses anyone with a row in this season (a dropped person stays dropped; only a restore brings them back), a deactivated account, a super or mentor, an alumnus, anyone with an active role when this season is ACTIVE (a draft only holds them; Start's checklist catches the clash), and anyone the season's `requiredProgram` blocks. `already_passed` is allowed. One refusal adds nobody: 409 `people_unavailable`, whose message names the first and counts the rest: `Mina is already leading a group in GBV 2026, and 2 others can't join.`\n\n`overrideUserIds` (SUPER only, each one among `userIds`; anyone else sending it gets 403) lets those people past the block, not past anything else, and records `overrideById` and `overrideAt` on the rows of those actually blocked. Marks sessions stale.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userIds"],
              properties: {
                userIds: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 500, uniqueItems: true },
                overrideUserIds: { type: "array", items: { type: "integer" }, maxItems: 500 },
              },
            },
          },
        },
      },
      responses: {
        201: ok(
          { type: "object", required: ["added"], properties: { added: { type: "integer" } } },
          "Everyone was added.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season, or no such person."),
        409: conflict("`people_unavailable` or `season_finished`."),
      },
    },
  },
  "/api/v1/seasons/{id}/enrollments/{userId}": {
    delete: {
      tags: ["Seasons"],
      summary: "Take someone off a draft's roster (SUPER or that season's admin)",
      description:
        "A draft's row is a plan, not history: this hard-deletes the enrolment and its group membership, so the season never shows in the person's history and they can be added again. Marks their sessions stale.",
      parameters: [idParam, userIdParam],
      responses: {
        200: ok(
          { type: "object", required: ["removed"], properties: { removed: { type: "boolean" } } },
          "Removed.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season, or the person has no row in it."),
        409: conflict("`not_draft`; `has_work` if they have any submission or quiz attempt in this season; `not_active` for a dropped or completed row."),
      },
    },
  },
  "/api/v1/seasons/{id}/enrollments/{userId}/override": {
    post: {
      tags: ["Seasons"],
      summary: "Override a block for someone on a draft's roster (SUPER only)",
      description: "Records `overrideById` and `overrideAt` on the person's active row, for Start's checklist.",
      parameters: [idParam, userIdParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["overrideById", "overrideAt"],
            properties: {
              overrideById: { type: "integer" },
              overrideAt: { type: "string", format: "date-time" },
            },
          },
          "Recorded.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: conflict("`not_found` — no such season, or the person has no active row in it."),
        409: conflict("`not_draft`."),
      },
    },
  },
};
