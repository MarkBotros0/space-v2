import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/seasons/{id}/people-candidates`: the people picker. Assembled by `../openapi.ts`. */
export const peopleCandidatePaths = {
  "/api/v1/seasons/{id}/people-candidates": {
    get: {
      tags: ["Seasons"],
      summary: "Who can be added to a season, with their last result (SUPER or that season's admin)",
      description:
        "Non-alumni student accounts (every student account, alumni too, when the season is community-wide; Super and Mentor never), no paging (about 200 rows; the phone virtualises). Sorted available, then already passed, then everyone else, by name in each group. `last` is the person's most recent season and how it ended (`PASSED`, `NOT_PASSED`, `COMPLETED` with no result recorded, or `DROPPED`) with attendance from their own enrolment date (`null` when no session fell after it). `availability` is one of `available`, `already_passed` (selectable, but Select all skips it), `did_not_pass` / `never_finished` (blocked by the season's `requiredProgram`; `overridable` for whoever may read this list, the season's admin or a SUPER), `in_role` (an active role elsewhere, selectable only while this season is a draft; `reason` says which) or `in_season` (already enrolled here; a dropped person's reason says only a super admin can bring them back). Someone serving in this same draft is `in_role` (\"X is serving in this season.\"), selectable while it is a draft. `pool` is `alumni` when the person has a `graduationYear`. Reasons are words, not colour. `places` is each finished season the person was in and how it ended (`passed`, `not_passed`, `dropped`). `season.sources` are the finished seasons whose passers can be added, newest end first, with `passed` (listed here) and `graduated` (passers who are alumni now, so a regular season does not list them); `season.suggestedSourceId` is the one this season normally follows (the last finished season of `requiredProgram`, else of its own `program`; null for a community-wide season or when that season has no passers).",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["season", "people"],
            properties: {
              season: {
                type: "object",
                required: ["id", "title", "requiredProgram", "isCommunityWide", "suggestedSourceId", "sources"],
                properties: {
                  id: { type: "integer" },
                  title: { type: "string" },
                  requiredProgram: { type: ["string", "null"] },
                  isCommunityWide: { type: "boolean" },
                  suggestedSourceId: { type: ["integer", "null"] },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["id", "code", "title", "passed", "graduated"],
                      properties: {
                        id: { type: "integer" },
                        code: { type: "string" },
                        title: { type: "string" },
                        passed: { type: "integer", minimum: 0 },
                        graduated: { type: "integer", minimum: 0 },
                      },
                    },
                  },
                },
              },
              people: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "name", "pool", "last", "availability", "reason", "selectable", "overridable", "places"],
                  properties: {
                    id: { type: "integer" },
                    name: { type: "string" },
                    pool: { type: "string", enum: ["student", "alumni"], description: "`alumni` when `graduationYear` is set." },
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
                    places: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["seasonId", "outcome"],
                        properties: {
                          seasonId: { type: "integer" },
                          outcome: { type: "string", enum: ["passed", "not_passed", "dropped"] },
                        },
                      },
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
};
