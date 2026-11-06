import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** Ending a season, correcting results and the overdue list. Assembled by `../openapi.ts`. */
export const seasonEndPaths = {
  "/api/v1/seasons/overdue": {
    get: {
      tags: ["Seasons"],
      summary: "ACTIVE seasons past their end date",
      description:
        "SUPER sees every ACTIVE season whose `endDate` has passed; an ADMIN sees only the seasons they administer; every other role gets an empty list. Future end dates and DRAFT seasons never appear. Registered before `/{id}`.",
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              seasons: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    code: { type: "string" },
                    title: { type: "string" },
                    endDate: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          "Overdue seasons, oldest end date first.",
        ),
        401: errRef("Unauthorized"),
      },
    },
  },
  "/api/v1/seasons/{id}/end": {
    post: {
      tags: ["Seasons"],
      summary: "End a season with pass results",
      description:
        "Season-admin only (SUPER passes). One transaction: the season is claimed with a conditional update on `status: ACTIVE` (of two concurrent calls exactly one wins; the other is 409 `season_not_active`), the end check re-runs, then the season becomes COMPLETED, each ACTIVE student is COMPLETED with `result` PASSED (or NOT_PASSED with the reason when listed in `notPassed`) and `resultSetAt`, and the sessions of the season's students, admins and leaders are marked stale. WITHDRAWN enrolments are untouched. 409 `season_unfinished` while any blocker exists; 400 when `notPassed` names someone without an ACTIVE enrolment, names a student twice, or carries a reason over 1000 characters. Nothing changes on any refusal.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["notPassed"],
              properties: {
                notPassed: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["userId", "reason"],
                    properties: { userId: { type: "integer" }, reason: { type: "string", nullable: true } },
                  },
                },
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
              season: {
                type: "object",
                properties: { id: { type: "integer" }, code: { type: "string" }, status: { type: "string", enum: ["COMPLETED"] } },
              },
            },
          },
          "The ended season.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_not_active` or `season_unfinished`."),
      },
    },
  },
  "/api/v1/seasons/{id}/results": {
    get: {
      tags: ["Seasons"],
      summary: "Pass results of a finished season",
      description:
        "SUPER only. COMPLETED enrolments of live students with name, group, attendance percent, `result` (null when none was recorded, e.g. a graduation) and `reason`. WITHDRAWN enrolments are not listed.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    userId: { type: "integer" },
                    name: { type: "string" },
                    groupName: { type: "string", nullable: true },
                    attendancePct: { type: "integer" },
                    result: { type: "string", enum: ["PASSED", "NOT_PASSED"], nullable: true },
                    reason: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "The results.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/seasons/{id}/results/{studentUserId}": {
    patch: {
      tags: ["Seasons"],
      summary: "Correct one student's result",
      description:
        "SUPER only. Sets `result` and stamps `resultSetAt`; the reason is kept only for NOT_PASSED and cleared for PASSED. 409 `not_finished` unless the season is COMPLETED or ARCHIVED; 409 `no_result` for an enrolment that is not COMPLETED (e.g. WITHDRAWN); 404 without an enrolment.",
      parameters: [
        idParam,
        { name: "studentUserId", in: "path", required: true, schema: { type: "integer" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["result", "reason"],
              properties: {
                result: { type: "string", enum: ["PASSED", "NOT_PASSED"] },
                reason: { type: "string", nullable: true },
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
              userId: { type: "integer" },
              result: { type: "string", enum: ["PASSED", "NOT_PASSED"] },
              reason: { type: "string", nullable: true },
            },
          },
          "The corrected result.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`not_finished` or `no_result`."),
      },
    },
  },

  "/api/v1/seasons/{id}/graduate": {
    post: {
      tags: ["Seasons"],
      summary: "Graduate several people from a finished season (SUPER only)",
      description:
        "All or nothing, in one transaction, under each person's row lock. The season must be COMPLETED or ARCHIVED, else 409 `season_not_finished`. Each person must be an active student account, not yet graduated, and have an enrolment in this season that isn't a drop; one refusal graduates nobody: 409 `people_unavailable`, whose message names the first and counts the rest (`Mina wasn't in this season, and 2 others can't graduate`). Each person graduates exactly as `POST /students/{id}/graduate` does: no pass result needed, any live enrolment elsewhere is completed with no result, and sessions are marked stale. This season's rows don't change. Writes one server-side audit line per person (ids only).",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["userIds", "graduationYear"],
              properties: {
                userIds: { type: "array", items: { type: "integer", minimum: 1 }, minItems: 1, maxItems: 250, uniqueItems: true },
                graduationYear: { type: "integer", minimum: 1990, description: "Up to the current year, evaluated per request." },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["graduated", "graduationYear"],
            properties: {
              graduated: { type: "array", items: { type: "integer" } },
              graduationYear: { type: "integer" },
            },
          },
          "Everyone graduated.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_not_finished` or `people_unavailable`."),
      },
    },
  },
};
