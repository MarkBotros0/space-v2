import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

const startIssue = {
  type: "object",
  required: ["userId", "name", "seat", "reason", "message", "otherSeasonCode"],
  properties: {
    userId: { type: "integer" },
    name: { type: "string" },
    seat: { type: "string", enum: ["admin", "leader", "student"] },
    reason: {
      type: "string",
      enum: [
        "already_in_role",
        "not_alumnus",
        "is_alumnus",
        "permanent_role",
        "user_inactive",
        "leader_has_group",
        "did_not_pass",
        "never_finished",
      ],
    },
    message: { type: "string", description: "The reason in words." },
    otherSeasonCode: {
      type: "string",
      nullable: true,
      description: "`already_in_role`: the season they hold that role in. Otherwise null.",
    },
  },
};

/** Starting a season. Assembled by `../openapi.ts`. */
export const seasonStartPaths = {
  "/api/v1/seasons/{id}/start-check": {
    get: {
      tags: ["Seasons"],
      summary: "What stops a draft from starting",
      description:
        "SUPER only. One item per reason, judged as though the season were already ACTIVE, over everyone in it: its admins, its leaders and its ACTIVE enrolments. A role held in another ACTIVE season is `already_in_role`; `leader_has_group` is someone leading two or more groups in this season; `did_not_pass` and `never_finished` are the required program, and a recorded override removes those but not `already_in_role`. Someone who can't hold the seat at all (`user_inactive`, `permanent_role`, `not_alumnus`, `is_alumnus`) gets that item alone. A person can appear once per seat they hold.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            required: ["ready", "items"],
            properties: {
              ready: { type: "boolean" },
              items: { type: "array", items: startIssue },
            },
          },
          "The checklist; `ready` when it is empty.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`not_draft`."),
      },
    },
  },
  "/api/v1/seasons/{id}/start": {
    post: {
      tags: ["Seasons"],
      summary: "Start a draft season",
      description:
        "SUPER only, and the only way a draft becomes ACTIVE: `PATCH` to ACTIVE is 409 `use_start_season`. One transaction: locks the season, then everyone in it, re-runs the check, sets ACTIVE and marks everyone's sessions stale, so their role arrives on their next refresh with no new sign-in. 409 `start_blocked` when the check isn't clear, with its first reason in `message` (read the list from `start-check`), and nothing changes. 409 `not_draft` for a season already started. A season with no people starts.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              season: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  code: { type: "string" },
                  status: { type: "string" },
                },
              },
            },
          },
          "The season, now ACTIVE.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`start_blocked` or `not_draft`."),
      },
    },
  },
};
