import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/**
 * Season passing by weighted score: the season's pass criteria, with the schemas only these paths
 * use. Assembled by `../openapi.ts`.
 */
export const seasonPassingSchemas = {
  PassCriteria: {
    type: "object",
    required: ["weights", "passMark"],
    additionalProperties: false,
    properties: {
      weights: {
        type: "object",
        required: ["attendance", "assignments", "quizzes"],
        additionalProperties: false,
        description: 'Whole percentages, 0 to 100, adding up to exactly 100 ("The weights must add up to 100%.").',
        properties: {
          attendance: { type: "integer", minimum: 0, maximum: 100 },
          assignments: { type: "integer", minimum: 0, maximum: 100 },
          quizzes: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      passMark: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "The score that passes, compared with the score rounded to one decimal.",
      },
    },
  },
} as const;

export const seasonPassingPaths = {
  "/api/v1/seasons/{id}/pass-criteria": {
    put: {
      tags: ["Seasons"],
      summary: "Set the season's pass criteria",
      description:
        "The season's admin or a SUPER (403 otherwise; a leader reads the criteria but can't set them). The weights and pass mark that pre-select who passes at End and show who is below the mark during the season; the score itself is never edited. Saved criteria become every other season's default until another season saves its own. 400 `weight_on_empty` (\"{Number} has nothing to count this season, so its weight must be 0.\") for a weight above 0 on a number the season has nothing for: no session, no live assignment, or no PAPER or published ONLINE quiz.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/PassCriteria" } } },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["criteria"],
            properties: { criteria: { $ref: "#/components/schemas/PassCriteria" } },
          },
          "The criteria as saved.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_not_active`: only an ACTIVE season's criteria can be set."),
      },
    },
  },
} as const;
