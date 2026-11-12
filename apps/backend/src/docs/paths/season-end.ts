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
        "Season-admin only (SUPER passes). One transaction: the season is claimed with a conditional update on `status: ACTIVE` (of two concurrent calls exactly one wins; the other is 409 `season_not_active`), the end check re-runs, then the season becomes COMPLETED, each ACTIVE student is COMPLETED with `result` PASSED (or NOT_PASSED with the reason when listed in `notPassed`) and `resultSetAt`, and the sessions of the season's students, admins and leaders are marked stale. WITHDRAWN enrolments are untouched. On a season with `graduatesOnPass`, in the same transaction, everyone who passed and isn't already an alumnus graduates: `graduationYear` becomes the smaller of the season's end year and the current year (org time), any other live seat they hold is completed with no result, and each gets a `student.graduate` audit line. `reviewed` is what the staff member was shown: compared inside the transaction, after the lock, a different `graduatesOnPass` or a different set of ACTIVE live students is 409 `season_unfinished` (\"The roster changed; check the season again.\"), so nobody passes or graduates from a stale review. 409 `season_unfinished` also while any blocker exists; 400 when `notPassed` names someone without an ACTIVE enrolment, names a student twice, or carries a reason over 1000 characters. Nothing changes on any refusal. Locks are taken season, then people, then rows, and a graduating season graduates only those whose row this call completed; a graduate's row on a DRAFT season's roster is deleted, unless work is recorded on it. Scoring: after the people are locked, every ACTIVE student's three numbers are read again and their score recomputed under `weights` (the shared `weightedScore`); any score that differs from `reviewed.scores` is 409 `season_unfinished` (\"The scores changed; check the season again.\"). A weight above 0 on a number the season has nothing for is 400 `weight_on_empty`, unless the season has nothing at all to count (then every score is null). The score only pre-selects: `notPassed` decides. The season stores `weights` and `passMark` (`passCriteriaSetAt` now); each completed enrolment its `passScore`, `passNumbers`, `resultAgainstScore` (passed below the mark or did not pass at or above it; false with no score) and `resultSetById` (the caller). A `passedNotes` note on a passing student is kept as the result's reason; one naming a student who does not pass is 400. Weights that don't add up to 100 are 400 \"The weights must add up to 100%.\".",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["notPassed", "weights", "passMark", "reviewed"],
              properties: {
                notPassed: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["userId", "reason"],
                    properties: { userId: { type: "integer" }, reason: { type: "string", nullable: true } },
                  },
                },
                passedNotes: {
                  type: "array",
                  description: "Optional notes on students who pass (e.g. below the mark). Default [].",
                  items: {
                    type: "object",
                    required: ["userId", "note"],
                    properties: { userId: { type: "integer" }, note: { type: "string", nullable: true } },
                  },
                },
                weights: {
                  type: "object",
                  required: ["attendance", "assignments", "quizzes"],
                  description: "Whole percentages adding up to 100.",
                  properties: {
                    attendance: { type: "integer", minimum: 0, maximum: 100 },
                    assignments: { type: "integer", minimum: 0, maximum: 100 },
                    quizzes: { type: "integer", minimum: 0, maximum: 100 },
                  },
                },
                passMark: { type: "integer", minimum: 0, maximum: 100 },
                reviewed: {
                  type: "object",
                  required: ["graduatesOnPass", "userIds", "scores"],
                  description: "The end check the staff member reviewed: its flag, its students and their scores.",
                  properties: {
                    graduatesOnPass: { type: "boolean" },
                    userIds: { type: "array", items: { type: "integer" } },
                    scores: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["userId", "score"],
                        properties: { userId: { type: "integer" }, score: { type: "number", nullable: true } },
                      },
                    },
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
                properties: {
                  id: { type: "integer" },
                  code: { type: "string" },
                  status: { type: "string", enum: ["COMPLETED"] },
                },
              },
              graduated: {
                type: "integer",
                description:
                  "How many became alumni just now, leaving out anyone who already was. 0 on an ordinary season.",
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
        "A SUPER, or anyone with a SeasonAdmin row for the season (its former admin keeps it after End); everyone else 403. `season`, the `criteria` End used (null for a season ended before weighted passing), and the COMPLETED enrolments of live students with name, `isAlumnus`, group, attendance percent (End's stored numbers, else read now), `result` (null when none was recorded, e.g. a graduation), `reason`, the `passScore` and `numbers` End stored (null before weighted passing), `againstScore`, and who set the result and when (`setByName`, `setAt`). WITHDRAWN enrolments are not listed.",
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
                  title: { type: "string" },
                  year: { type: "integer" },
                  graduatesOnPass: { type: "boolean" },
                },
              },
              criteria: { allOf: [{ $ref: "#/components/schemas/PassCriteria" }], nullable: true },
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
                    passScore: { type: "number", nullable: true },
                    numbers: { allOf: [{ $ref: "#/components/schemas/PassingNumbers" }], nullable: true },
                    againstScore: { type: "boolean" },
                    setByName: { type: "string", nullable: true },
                    setAt: { type: "string", format: "date-time", nullable: true },
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
        "A SUPER, or anyone with a SeasonAdmin row for the season. Sets `result`, stamps `resultSetAt` and `resultSetById` (the caller), and works out `resultAgainstScore` again from the stored `passScore` and the season's `passMark` (the score itself never changes); the reason is kept only for NOT_PASSED and cleared for PASSED. On a season with `graduatesOnPass`, PASSED graduates a student who isn't yet an alumnus, as `POST /students/{id}/graduate` does (year: the smaller of the season's end year and the current year); NOT_PASSED never removes alumni status. On an ordinary season it does neither. 409 `not_finished` unless the season is COMPLETED or ARCHIVED; 409 `no_result` for an enrolment that is not COMPLETED (e.g. WITHDRAWN); 404 without an enrolment.",
      parameters: [idParam, { name: "studentUserId", in: "path", required: true, schema: { type: "integer" } }],
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
