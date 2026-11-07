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
        "Season-admin only (SUPER passes). One transaction: the season is claimed with a conditional update on `status: ACTIVE` (of two concurrent calls exactly one wins; the other is 409 `season_not_active`), the end check re-runs, then the season becomes COMPLETED, each ACTIVE student is COMPLETED with `result` PASSED (or NOT_PASSED with the reason when listed in `notPassed`) and `resultSetAt`, and the sessions of the season's students, admins and leaders are marked stale. WITHDRAWN enrolments are untouched. On a season with `graduatesOnPass`, in the same transaction, everyone who passed and isn't already an alumnus graduates: `graduationYear` becomes the smaller of the season's end year and the current year (org time), any other live seat they hold is completed with no result, and each gets a `student.graduate` audit line. `reviewed` is what the staff member was shown: compared inside the transaction, after the lock, a different `graduatesOnPass` or a different set of ACTIVE live students is 409 `season_unfinished` (\"The roster changed; check the season again.\"), so nobody passes or graduates from a stale review. 409 `season_unfinished` also while any blocker exists; 400 when `notPassed` names someone without an ACTIVE enrolment, names a student twice, or carries a reason over 1000 characters. Nothing changes on any refusal.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["notPassed", "reviewed"],
              properties: {
                notPassed: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["userId", "reason"],
                    properties: { userId: { type: "integer" }, reason: { type: "string", nullable: true } },
                  },
                },
                reviewed: {
                  type: "object",
                  required: ["graduatesOnPass", "userIds"],
                  description: "The end check the staff member reviewed: its flag and its students.",
                  properties: {
                    graduatesOnPass: { type: "boolean" },
                    userIds: { type: "array", items: { type: "integer" } },
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
              graduated: { type: "integer", description: "How many became alumni just now, leaving out anyone who already was. 0 on an ordinary season." },
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
        "SUPER only. COMPLETED enrolments of live students with name, `isAlumnus`, group, attendance percent, `result` (null when none was recorded, e.g. a graduation) and `reason`. WITHDRAWN enrolments are not listed.",
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
                    isAlumnus: { type: "boolean" },
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
        "SUPER only. Sets `result` and stamps `resultSetAt`; the reason is kept only for NOT_PASSED and cleared for PASSED. On a season with `graduatesOnPass`, PASSED graduates a student who isn't yet an alumnus, as `POST /students/{id}/graduate` does (year: the smaller of the season's end year and the current year); NOT_PASSED never removes alumni status. On an ordinary season it does neither. 409 `not_finished` unless the season is COMPLETED or ARCHIVED; 409 `no_result` for an enrolment that is not COMPLETED (e.g. WITHDRAWN); 404 without an enrolment.",
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
              graduated: { type: "boolean", description: "This correction made them an alumnus." },
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
};
