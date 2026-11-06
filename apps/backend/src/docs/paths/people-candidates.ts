import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/seasons/{id}/people-candidates`: the people picker. Assembled by `../openapi.ts`. */
export const peopleCandidatePaths = {
  "/api/v1/seasons/{id}/people-candidates": {
    get: {
      tags: ["Seasons"],
      summary: "Who can be added to a season, with their last result (SUPER or that season's admin)",
      description:
        "Non-alumni student accounts, no paging (about 200 rows; the phone virtualises). Sorted available, then already passed, then everyone else, by name in each group. `last` is the person's most recent season and how it ended (`PASSED`, `NOT_PASSED`, `COMPLETED` with no result recorded, or `DROPPED`) with attendance from their own enrolment date (`null` when no session fell after it). `availability` is one of `available`, `already_passed` (selectable, but Select all skips it), `did_not_pass` / `never_finished` (blocked by the season's `requiredProgram`; `overridable` only for SUPER), `in_role` (an active role elsewhere, selectable only while this season is a draft; `reason` says which) or `in_season` (already enrolled here; a dropped person's reason says only a super admin can bring them back). Reasons are words, not colour.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["season", "people"],
            properties: {
              season: {
                type: "object",
                required: ["id", "title", "requiredProgram"],
                properties: {
                  id: { type: "integer" },
                  title: { type: "string" },
                  requiredProgram: { type: ["string", "null"] },
                },
              },
              people: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "name", "last", "availability", "reason", "selectable", "overridable"],
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    last: {
                      type: ["object", "null"],
                      required: ["seasonTitle", "outcome", "attendancePct"],
                      properties: {
                        seasonTitle: { type: "string" },
                        outcome: { type: "string", enum: ["PASSED", "NOT_PASSED", "DROPPED", "COMPLETED"] },
                        attendancePct: { type: ["integer", "null"], minimum: 0, maximum: 100 },
                      },
                    },
                    availability: {
                      type: "string",
                      enum: ["available", "already_passed", "did_not_pass", "never_finished", "in_role", "in_season"],
                    },
                    reason: { type: ["string", "null"] },
                    selectable: { type: "boolean" },
                    overridable: { type: "boolean" },
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
};
