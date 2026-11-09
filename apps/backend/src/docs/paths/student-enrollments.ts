import { conflict, errRef, ok } from "../helpers";
import { idParam } from "../shared/params";

/** `/api/v1/students/{id}/enrollments*`, spread into `studentPaths` (./students.ts). */
export const studentEnrollmentPaths = {
  "/api/v1/students/{id}/enrollments": {
    post: {
      tags: ["Students"],
      summary: "Enroll a student in a season",
      description:
        "Season-admin of the **target** season (SUPER passes); gated before any lookup. Creates an ACTIVE enrollment and marks the student's sessions stale; the current season is derived from live enrolments, never stored. One enrollment per student per season, ever: a second attempt \u2014 even over a WITHDRAWN row \u2014 is 409 `already_enrolled`. A COMPLETED or ARCHIVED season takes no enrollments: 409 `season_finished`, even for SUPER. Runs the same check as `POST /seasons/{id}/enrollments` under the person's row lock, with the reason in the message: `already_in_role` (an active role, on an active season), `is_alumnus`, or `not_eligible` (blocked by the season's required program; overriding needs that endpoint).\n\nBoundary: this endpoint owns enrollment existence and status only. `groupId` is written exclusively by `PATCH /api/v1/groups/{id}` \u2014 group membership is written only there. Enrollment rows are deleted only by `DELETE /seasons/{id}/enrollments/{userId}`, from a draft.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["seasonId"],
              properties: { seasonId: { type: "integer", minimum: 1 } },
            },
          },
        },
      },
      responses: {
        201: ok(
          {
            type: "object",
            properties: {
              id: { type: "integer" },
              seasonId: { type: "integer" },
              status: { type: "string", enum: ["ACTIVE"] },
            },
          },
          "Enrolled.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`already_enrolled`, `season_finished`, `already_in_role`, `is_alumnus` or `not_eligible`."),
      },
    },
  },

  "/api/v1/students/{id}/enrollments/{seasonId}": {
    patch: {
      tags: ["Students"],
      summary: "Drop an enrollment",
      description:
        "Addressed by (student, season) \u2014 the natural unique key. Season-admin of that season (SUPER passes); the gate runs **before** the row lookup so a refused caller learns nothing about whether the enrollment exists. The one transition is ACTIVE \u2192 WITHDRAWN (sets droppedAt, optional `dropReason`). `COMPLETED` is 409 `use_end_season` for everyone, SUPER included, before anything else is checked: finishing one student alone would skip pass/fail, so only ending the season or graduating completes a row. ACTIVE is not accepted in the body; `POST .../restore` is the way back. The write holds the season's share lock, then the person's, and the update is conditional on ACTIVE, so a row that moved on answers 409 `not_active` rather than being overwritten. A finished season is 409 `season_finished`. A DRAFT season is 409 `season_draft`: a draft's row is a plan, so `DELETE /seasons/{id}/enrollments/{userId}` takes it off. The row is transitioned in place and never deleted. Writes a server-side audit line (actor and subject ids only).",
      parameters: [idParam, { name: "seasonId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: {
                status: { type: "string", enum: ["WITHDRAWN", "COMPLETED"] },
                dropReason: { type: ["string", "null"], maxLength: 500, description: "Only with WITHDRAWN." },
              },
            },
          },
        },
      },
      responses: {
        200: ok(
          { type: "object", properties: { id: { type: "integer" }, status: { type: "string" } } },
          "Transitioned.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`use_end_season`, `not_active`, `season_finished` or `season_draft`."),
      },
    },
  },

  "/api/v1/students/{id}/enrollments/{seasonId}/restore": {
    post: {
      tags: ["Students"],
      summary: "Bring a dropped student back (SUPER only)",
      description:
        "WITHDRAWN \u2192 ACTIVE on the row the student already has, keeping their group. Clears `droppedAt`. `dropReason` stays on the row but no read returns it unless the row is WITHDRAWN, and a later drop overwrites it; the audit line is ids only. The season must be DRAFT or ACTIVE. The rule is checked again as if adding, under the season's share lock and the person's row lock, with the reason in the message: `already_in_role`, `is_alumnus`, `user_inactive`, `permanent_role`, `not_student`, or `not_eligible` when the required program blocks them. `override: true` lets a blocked person back and records `overrideById` and `overrideAt`; it lifts the block and nothing else. An override from before the drop no longer counts, and the row keeps none unless they're blocked now. Marks sessions stale.",
      parameters: [idParam, { name: "seasonId", in: "path", required: true, schema: { type: "integer", minimum: 1 } }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: { override: { type: "boolean" } },
            },
          },
        },
      },
      responses: {
        200: ok(
          {
            type: "object",
            required: ["id", "status"],
            properties: { id: { type: "integer" }, status: { type: "string", enum: ["ACTIVE"] } },
          },
          "Brought back.",
        ),
        400: errRef("BadRequest"),
        401: errRef("Unauthorized"),
        403: errRef("Forbidden"),
        404: errRef("NotFound"),
        409: conflict("`season_finished`, `not_dropped`, or why they can't hold the seat (see above)."),
      },
    },
  },
} as const;
