import { conflict, errRef, errorResponse, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/groups/*`. Assembled into the document by `../openapi.ts`. */
export const groupPaths = {
  "/api/v1/groups": {
    get: {
      tags: ["Groups"],
      summary: "The groups this caller is personally in",
      description:
        "What the `/groups` tab needs — `navigation.ts` gives LEADER this as their first tab, and until now nothing served it: v1 answered the question with a query written inside the page, one of five group reads that never reached its REST layer.\n\nA LEADER gets the groups they lead; a STUDENT gets their own, across every season they were enrolled in. Staff above leader are not *in* groups, so they get an empty list and browse by season instead — returning everything they could administer would make \"my groups\" mean something different per role.",
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              groups: {
                type: "array",
                items: { $ref: "#/components/schemas/GroupListItem" },
              },
            },
          },
          "Newest season first.",
        ),
        401: errRef("Unauthorized"),
      },
    },
  },

  "/api/v1/groups/leader-options": {
    get: {
      tags: ["Groups"],
      summary: "Leaders a group form may pick from",
      description:
        "Season-admin (of any season) or SUPER only. Live LEADER users, name-ordered. Interim: spec 05 puts this behind the user directory (Plan 9), which may replace this route.",
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              leaders: {
                type: "array",
                items: {
                  type: "object",
                  properties: { id: { type: "integer" }, name: { type: ["string", "null"] }, email: { type: "string" } },
                },
              },
            },
          },
          "Leader users.",
        ),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/groups/{id}/impact": {
    get: {
      tags: ["Groups"],
      summary: "What deleting a group would do",
      description:
        "Season-admin only. studentCount (ACTIVE enrolments that would lose their group), leaderCount, and soleTargetAssignments: live assignments targeted at this group ONLY, which make DELETE refuse (spec 05 R44).",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              studentCount: { type: "integer" },
              leaderCount: { type: "integer" },
              soleTargetAssignments: {
                type: "array",
                items: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" } } },
              },
            },
          },
          "The impact.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/groups/{id}": {
    delete: {
      tags: ["Groups"],
      summary: "Delete a group",
      description:
        "Season-admin only. Designed rather than ported: v1's delete action was unreachable (C12). Refuses with 409 `group_has_sole_targets` while any live non-all-groups assignment targets only this group, so none is left visible to nobody. Otherwise, in one transaction that re-checks that condition: unassigns every enrolment pointing at the group, deletes its leaders, memberships and target rows, and hard-deletes the group. Returns `{ deleted: true, orphanedStudentIds }`.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: { deleted: { type: "boolean" }, orphanedStudentIds: { type: "array", items: { type: "integer" } } },
          },
          "Deleted.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`group_has_sole_targets`."),
      },
    },
    patch: {
      tags: ["Groups"],
      summary: "Edit a group's name, description, leaders and roster",
      description:
        "Season-admin power. A group's own leader is deliberately refused: leading a group does not confer the right to change who else leads it, and a GroupLeader row is a claim in the token.\n\nThe roster write preserves enrolment history. v1's group form deleted and recreated the SeasonEnrollment, resetting status, enrolledAt, droppedAt and dropReason — a WITHDRAWN student silently returned as ACTIVE with their reason for leaving erased, on a model the schema itself calls append-only. A student removed from the list keeps their enrolment and loses only the group pointer.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/GroupWriteRequest" },
          },
        },
      },
      responses: {
        200: ok({ type: "object", properties: { id: { type: "integer" } } }, "Updated."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: {
          description: "`name_taken`, `invalid_leader` or `not_enrolled`.",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
    get: {
      tags: ["Groups"],
      summary: "Group detail with leaders and students",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/GroupDetail" }, "The group."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },

} as const;
