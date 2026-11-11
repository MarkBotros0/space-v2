import { conflict, errRef, errorResponse, ok } from "../helpers";
import { idParam } from "../shared/params";

/** A season's roster, groups, sessions and assignments; spread into `seasonPaths` (./seasons.ts). */
export const seasonContentPaths = {
  "/api/v1/seasons/{id}/roster": {
    get: {
      tags: ["Groups"],
      summary: "Season roster for bulk group assignment",
      description:
        "Season-admin only. The season's participants (ACTIVE; in a finished season also COMPLETED; never WITHDRAWN) who are live STUDENT users (C9 — v1 used StudentProfile.activeSeasonId), name-ordered, unpaginated (a season is hundreds of rows; the group form needs full membership).",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: { roster: { type: "array", items: { $ref: "#/components/schemas/SeasonRosterRow" } } },
          },
          "The roster.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/seasons/{id}/group-assignments": {
    put: {
      tags: ["Groups"],
      summary: "Bulk-assign students to this season's groups",
      description:
        "Season-admin only; at most 500 rows, each student once. Eligibility is a live student among the season's participants (ACTIVE; in a finished season also COMPLETED; never WITHDRAWN) in THIS season (v1 gated on activeSeasonId and upserted enrolments, resurrecting withdrawn students). Non-eligible rows are skipped and returned in skippedStudentIds; counts are what was WRITTEN (v1 reported the requested length). A null groupId removes only this season's membership. Any groupId outside the season refuses the whole batch (400 group_outside_season). One transaction. Plan 17's group importer writes through the same function.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/GroupAssignmentsRequest" } } },
      },
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              assigned: { type: "integer" },
              unassigned: { type: "integer" },
              skippedStudentIds: { type: "array", items: { type: "integer" } },
            },
          },
          "What was written.",
        ),
        400: {
          description: "`bad_request` or `group_outside_season`.",
          content: { "application/json": { schema: errorResponse } },
        },
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/seasons/{id}/groups": {
    post: {
      tags: ["Groups"],
      summary: "Create a group in a season",
      description:
        "Season-admin power. Refuses a duplicate name within the season — v1 has no such constraint and its CSV importer matches groups *by name*, so two groups sharing one silently misroute an import. A real constraint needs a migration; this is the check available now.",
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
        201: ok({ type: "object", properties: { id: { type: "integer" } } }, "Created."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: {
          description:
            "`name_taken`, `not_enrolled` (a named student is not on this season's roster), or why a named leader can't serve: `not_alumnus`, `permanent_role`, `user_inactive`, `season_finished`, `already_in_role` or `leader_has_group`.",
          content: { "application/json": { schema: errorResponse } },
        },
      },
    },
    get: {
      tags: ["Seasons"],
      summary: "Groups in a season",
      description:
        "Scoped to the caller: SUPER, MENTOR and the season's ADMIN see every group; a LEADER sees only the ones they lead (v1 showed them all of them); a STUDENT sees their own, resolved from their enrolment in *this* season rather than from their current group membership.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: { groups: { type: "array", items: { $ref: "#/components/schemas/GroupListItem" } } },
          },
          "Groups.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/seasons/{id}/sessions": {
    get: {
      tags: ["Seasons"],
      summary: "Sessions in a season",
      description: "`checkInToken` is null for a STUDENT.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: { sessions: { type: "array", items: { $ref: "#/components/schemas/SessionListItem" } } },
          },
          "Sessions, earliest first.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
  },
  "/api/v1/seasons/{id}/assignments": {
    get: {
      tags: ["Seasons"],
      summary: "Assignments in a season",
      description:
        "**The row shape depends on the caller's role.** Staff receive `StaffAssignmentListItem` (season-wide counts); a STUDENT receives `StudentAssignmentListItem` (their own status and how many parts are done) for every assignment of the season.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              assignments: {
                type: "array",
                items: {
                  oneOf: [
                    { $ref: "#/components/schemas/StaffAssignmentListItem" },
                    { $ref: "#/components/schemas/StudentAssignmentListItem" },
                  ],
                },
              },
            },
          },
          "Assignments.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
      },
    },
    post: {
      tags: ["Assignments"],
      summary: "Create an assignment in a season",
      description:
        "Season admins (SUPER passes). The row and its parts, in the body's order, commit together. Afterwards, in an ACTIVE season (a draft's roster is not told), every live student with an ACTIVE enrolment gets ASSIGNMENT_CREATED once, titled `New assignment: <title>`, body `Due <org time>` (omitted with no due date), link `/student/assignments/<id>` (v1's path, ruling X1). A notification failure never fails the create.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
      },
      responses: {
        201: ok(
          { $ref: "#/components/schemas/AssignmentDetail" },
          "Created: the assignment as GET returns it to staff.",
        ),
        400: conflict("`bad_request` (body; message names the first failing field)."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
} as const;
