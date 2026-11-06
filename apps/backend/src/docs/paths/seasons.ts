import { conflict, errRef, errorResponse, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/seasons/*`. Assembled into the document by `../openapi.ts`. */
export const seasonPaths = {
  "/api/v1/seasons": {
    get: {
      tags: ["Seasons"],
      summary: "Seasons visible to the caller",
      description:
        "SUPER and MENTOR see all; ADMIN sees their scoped seasons; LEADER sees DRAFT and ACTIVE seasons containing a group they lead (a former leader has no access to a finished season); STUDENT sees seasons they are enrolled in. Filtering happens in the query, so a season you cannot see is never read.",
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              seasons: { type: "array", items: { $ref: "#/components/schemas/SeasonListItem" } },
            },
          },
          "Visible seasons, newest year first.",
        ),
        401: errRef("Unauthorized"),
      },
    },
    post: {
      tags: ["Seasons"],
      summary: "Create a season",
      description:
        "SUPER only (spec 02 D3). Title is derived as '<program> <year>'. Unlike v1, the absence budget fields are persisted on create (D1). A soft-deleted season still reserves its code. `status` must be `DRAFT` (400 otherwise): no season skips Start.",
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } } },
      responses: {
        201: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Created."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        409: conflict("`code_taken` — the slugified code is in use (also returned for the unique-index race, D15; D15's generic `conflict` is deliberately more specific here)."),
      },
    },
  },
  "/api/v1/seasons/{id}": {
    get: {
      tags: ["Seasons"],
      summary: "Season detail with counts and groups",
      parameters: [idParam],
      responses: {
        200: ok({ $ref: "#/components/schemas/SeasonDetail" }, "The season."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
    patch: {
      tags: ["Seasons"],
      summary: "Update a season",
      description:
        "Asymmetric by role (spec 02 D3). SUPER sends the full SeasonWriteRequest (v1's whole-body update; title re-derived). A season ADMIN sends a partial body containing only `description`, `absenceBudgetMinutes`, `absenceWeightMinutes`; any other key is refused with 403 `forbidden_field` rather than stripped. Status moves (SUPER): only an unchanged status and COMPLETED to or from ARCHIVED are allowed. DRAFT to ACTIVE is 409 `use_start_season` (see `POST /seasons/{id}/start`); anything else from DRAFT is 409 `invalid_status_change`; anything else from ACTIVE is 409 `use_end_season`; COMPLETED or ARCHIVED back to ACTIVE or DRAFT is 409 `season_finished`; a status that changed while the request ran (a Start landing first) is 409 `season_changed`, and nothing is written.",
      parameters: [idParam],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SeasonWriteRequest" } } } },
      responses: {
        200: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Updated."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: conflict("`forbidden` (not SUPER, not this season's ADMIN) or `forbidden_field` (ADMIN sent an identity field)."),
        404: errRef("NotFound"),
        409: conflict("`code_taken`, `use_start_season`, `use_end_season`, `invalid_status_change`, `season_finished` or `season_changed`."),
      },
    },
    delete: {
      tags: ["Seasons"],
      summary: "Soft-delete a season",
      description:
        "SUPER only. Refused with 409 `season_in_use` while the season has any enrollment or session — archive it instead (decision on spec 02 D4). The current season is derived from live seasons, so a deleted one drops out of every scope on its own.",
      parameters: [idParam],
      responses: {
        200: ok({ type: "object", properties: { deleted: { type: "boolean" } } }, "Deleted."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_in_use`."),
      },
    },
  },
  "/api/v1/seasons/{id}/duplicate": {
    post: {
      tags: ["Seasons"],
      summary: "Duplicate a season's structure",
      description:
        "SUPER only. Creates a DRAFT season copying program, `requiredProgram`, description and the budget fields; groups (name/description only — leaders and students are NOT copied), sessions and non-deleted assignments, every date shifted by (startDate − source.startDate), assignment sessionIds and group targets remapped to the clones. Recurrence series get FRESH ids (v1 copied them, letting series edits cross seasons — ruling C10). `code` defaults to slugify('<program> <year>'). A soft-deleted source is 404.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["year", "startDate", "endDate"],
              properties: {
                year: { type: "integer", minimum: 2000, maximum: 2100 },
                code: { type: "string" },
                startDate: { type: "string", format: "date-time" },
                endDate: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      responses: {
        201: ok({ type: "object", properties: { id: { type: "integer" }, code: { type: "string" } } }, "Created."),
        400: conflict("`bad_request` or `invalid_code` (the derived slug is not a valid season code)."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`code_taken`."),
      },
    },
  },
  "/api/v1/seasons/by-code/{code}": {
    get: {
      tags: ["Seasons"],
      summary: "Season detail by code",
      description:
        "Resolves a season code (the mobile app's address) to the same SeasonDetail GET /seasons/{id} serves. 404 for an unknown or soft-deleted code; 403 when the caller cannot see the season. The API stays canonical on id (spec 02 D8).",
      parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok({ $ref: "#/components/schemas/SeasonDetail" }, "The season."),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },
  "/api/v1/seasons/{id}/end-check": {
    get: {
      tags: ["Seasons"],
      summary: "What blocks a season from ending",
      description:
        "Season-admin only (SUPER passes). Blockers: SUBMITTED submissions and quiz attempts awaiting a grade, and finished sessions (`startsAt + durationMinutes` before now) with ACTIVE students unmarked (`missing`, counting only students enrolled by the time the session started). Drafts, returned work, in-progress attempts, soft-deleted assignments and students never block. `students` lists the ACTIVE, non-deleted students with their group and attendance percent (PRESENT + LATE over every session, 0 with none). 409 `season_not_active` unless the season is ACTIVE.",
      parameters: [idParam],
      responses: {
        200: ok(
          {
            type: "object",
            properties: {
              blockers: {
                type: "object",
                properties: {
                  submissions: { type: "array", items: { type: "object", properties: { publicId: { type: "string" }, assignmentTitle: { type: "string" }, studentName: { type: "string" } } } },
                  quizAttempts: { type: "array", items: { type: "object", properties: { quizId: { type: "integer" }, attemptId: { type: "integer" }, quizTitle: { type: "string" }, studentName: { type: "string" } } } },
                  attendance: { type: "array", items: { type: "object", properties: { sessionId: { type: "integer" }, title: { type: "string" }, startsAt: { type: "string", format: "date-time" }, missing: { type: "integer" } } } },
                },
              },
              students: { type: "array", items: { type: "object", properties: { userId: { type: "integer" }, name: { type: "string" }, groupName: { type: "string", nullable: true }, attendancePct: { type: "integer" } } } },
            },
          },
          "The end check.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_not_active`."),
      },
    },
  },
  "/api/v1/seasons/{id}/roster": {
    get: {
      tags: ["Groups"],
      summary: "Season roster for bulk group assignment",
      description:
        "Season-admin only. The season's participants (ACTIVE; in a finished season also COMPLETED; never WITHDRAWN) who are live STUDENT users (C9 — v1 used StudentProfile.activeSeasonId), name-ordered, unpaginated (a season is hundreds of rows; the group form needs full membership).",
      parameters: [idParam],
      responses: {
        200: ok(
          { type: "object", properties: { roster: { type: "array", items: { $ref: "#/components/schemas/SeasonRosterRow" } } } },
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
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/GroupAssignmentsRequest" } } } },
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
          { type: "object", properties: { groups: { type: "array", items: { $ref: "#/components/schemas/GroupListItem" } } } },
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
          { type: "object", properties: { sessions: { type: "array", items: { $ref: "#/components/schemas/SessionListItem" } } } },
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
        "**The row shape depends on the caller's role.** Staff receive `StaffAssignmentListItem` (season-wide counts); a STUDENT receives `StudentAssignmentListItem` (their own status), filtered to assignments that target them.",
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
        "Season admins (SUPER passes). Row and targets commit in one transaction. Afterwards, in an ACTIVE season (a draft's roster is not told), every ACTIVE enrolled student the assignment targets — resolved through SeasonEnrollment (ruling C9), opted-out students skipped — gets ASSIGNMENT_CREATED titled `New assignment: <title>`, body `Due <org time>` (omitted with no due date), link `/student/assignments/<id>` (v1's path, ruling X1). A notification failure never fails the create.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/AssignmentWriteRequest" } } },
      },
      responses: {
        201: ok({ $ref: "#/components/schemas/AssignmentDetail" }, "Created — the same shape GET /assignments/{id} returns."),
        400: conflict("`bad_request` (body; message names the first failing field), `invalid_group`, or `invalid_session`."),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
      },
    },
  },

} as const;
