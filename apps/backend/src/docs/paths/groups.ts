import { errRef, errorResponse, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/groups/*`. Assembled into the document by `../openapi.ts`. */
export const groupPaths = {
  "/api/v1/groups": {
    get: {
      tags: ["Groups"],
      summary: "The groups this caller is personally in",
      description:
        'What the `/groups` tab needs — `navigation.ts` gives LEADER this as their first tab, and until now nothing served it: v1 answered the question with a query written inside the page, one of five group reads that never reached its REST layer.\n\nA LEADER gets the groups they lead; a STUDENT gets their own, across every season they were enrolled in. Staff above leader are not *in* groups, so they get an empty list and browse by season instead — returning everything they could administer would make "my groups" mean something different per role.',
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

  "/api/v1/groups/{id}/impact": {
    get: {
      tags: ["Groups"],
      summary: "What deleting a group would do",
      description:
        "Season-admin only. studentCount (the season's participants who would lose their group: ACTIVE, in a finished season also COMPLETED) and leaderCount.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              studentCount: { type: "integer" },
              leaderCount: { type: "integer" },
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
        "Season-admin only. Designed rather than ported: v1's delete action was unreachable (C12). Its leaders refresh into their new role, still signed in. In one transaction: unassigns every enrolment pointing at the group, deletes its leaders and memberships, and hard-deletes the group. Assignments are for the whole season, so none depends on a group. Returns `{ deleted: true, orphanedStudentIds }`.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              deleted: { type: "boolean" },
              orphanedStudentIds: { type: "array", items: { type: "integer" } },
            },
          },
          "Deleted.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Groups"],
      summary: "Edit a group's name, description, leaders and roster",
      description:
        "Season-admin power. A group's own leader is deliberately refused: leading a group does not confer the right to change who else leads it, and a GroupLeader row is a claim in the token.\n\nThe roster write preserves enrolment history. v1's group form deleted and recreated the SeasonEnrollment, resetting status, enrolledAt, droppedAt and dropReason — a WITHDRAWN student silently returned as ACTIVE with their reason for leaving erased, on a model the schema itself calls append-only. A student removed from the list keeps their enrolment and loses only the group pointer.\n\nAn absent `leaderIds` or `studentIds` leaves that list alone, so `{ name }` is a rename. A sent `studentIds` replaces the group's live students only: a member who is no longer a live STUDENT (now serving, or a deleted account) can't be listed, so is never removed.",
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
          description:
            "`name_taken`, `not_enrolled`, or why a newly added leader can't serve: `not_alumnus`, `permanent_role`, `user_inactive`, `season_finished`, `already_in_role` or `leader_has_group`.",
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
